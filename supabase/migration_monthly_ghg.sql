-- ============================================================================
-- MIGRATION: Architettura mensile GHG per Enworia
-- ============================================================================
-- Crea:  ghg_periods, energy_entries, hr_entries, vsme_params
-- Altera: scope3_entries (aggiunge period_id, granularity, estimated)
-- Vista:  period_summary (materialized)
-- Migra:  dati ATTREZZATURE MECCANICHE FERRARI SRL → struttura nuova
-- ============================================================================

-- ▸▸▸ 1. GHG_PERIODS — periodi di rendicontazione mensile/annuale
-- ============================================================================
CREATE TABLE IF NOT EXISTS ghg_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_id     uuid REFERENCES ghg_reports(id) ON DELETE SET NULL,
  year          integer NOT NULL,
  month         integer CHECK (month IS NULL OR (month BETWEEN 1 AND 12)),
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','locked')),
  locked_at     timestamptz,
  locked_by     text,          -- nome o id consulente
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT ghg_periods_unique UNIQUE (company_id, year, month)
);

COMMENT ON TABLE  ghg_periods IS 'Periodo rendicontazione GHG — month=NULL per dati annuali legacy';
COMMENT ON COLUMN ghg_periods.month IS 'NULL = dato annuale, 1-12 = mensile';

-- ▸▸▸ 2. ENERGY_ENTRIES — sorgenti Scope 1 + Scope 2 unificate
-- ============================================================================
CREATE TABLE IF NOT EXISTS energy_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES ghg_periods(id) ON DELETE CASCADE,

  -- Classificazione
  scope           smallint NOT NULL CHECK (scope IN (1, 2)),
  source_category text NOT NULL,
    -- scope 1: 'stazionario','mobile','hfc','processo','fuggitive'
    -- scope 2: 'elettricita','calore','vapore'

  source_label    text,          -- etichetta utente: "Caldaia sede", "POD IT001E..."

  -- Attività
  quantity        numeric(15,4) NOT NULL,
  unit            text NOT NULL,   -- Sm3, litri, kWh, kg, km, tkm

  -- Fattore di emissione
  fe_id           uuid REFERENCES emission_factors(id),
  fe_value        numeric(15,8),   -- valore FE usato (snapshot)
  fe_unit         text,            -- kgCO2e/Sm3, kgCO2e/kWh ...
  fe_source       text,            -- "ISPRA 2023", "DEFRA 2025" ...

  -- Risultato
  co2e_kg         numeric(15,6),   -- quantity × fe_value × 1000 se FE in tCO2e

  -- Metadati
  data_quality    text,            -- bolletta, contatore, stima_ragionata ...
  data_source     text,            -- fattura, lettura contatore, stima
  estimated       boolean DEFAULT false,
  notes           text,

  -- Scope 2 specifici (null per scope 1)
  approach        text CHECK (approach IS NULL OR approach IN ('location','market')),
  market_instrument text,          -- go, rec, i_rec, ppa, supplier_rate, none
  pv_self_consumed_kwh numeric(12,2),

  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_energy_entries_period ON energy_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_energy_entries_scope  ON energy_entries(scope);

COMMENT ON TABLE energy_entries IS 'Sorgenti emissive Scope 1 e 2 — una riga per sorgente per periodo';

-- ▸▸▸ 3. SCOPE3_ENTRIES — aggiunta colonne per granularità mensile
-- ============================================================================
-- scope3_entries esiste già (creata via console). Aggiungiamo le colonne.
DO $$
BEGIN
  -- period_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'period_id'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN period_id uuid REFERENCES ghg_periods(id) ON DELETE SET NULL;
  END IF;

  -- granularity
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'granularity'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN granularity text DEFAULT 'annual'
      CHECK (granularity IN ('monthly','event','annual'));
  END IF;

  -- event_date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'event_date'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN event_date date;
  END IF;

  -- estimated
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'estimated'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN estimated boolean DEFAULT false;
  END IF;

  -- co2e_kg (risultato calcolo emissioni)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'co2e_kg'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN co2e_kg numeric(15,6);
  END IF;

  -- fe_id (riferimento fattore di emissione usato)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'fe_id'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN fe_id uuid REFERENCES emission_factors(id);
  END IF;

  -- fe_value (snapshot del FE al momento del calcolo)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scope3_entries' AND column_name = 'fe_value'
  ) THEN
    ALTER TABLE scope3_entries ADD COLUMN fe_value numeric(15,8);
  END IF;
END $$;

-- ▸▸▸ 4. HR_ENTRIES — dati risorse umane per pendolarismo e WFH
-- ============================================================================
CREATE TABLE IF NOT EXISTS hr_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES ghg_periods(id) ON DELETE CASCADE,
  employees_total integer,
  days_worked     numeric(6,1),    -- giorni lavorati nel periodo
  wfh_days        numeric(6,1),    -- giorni smart working
  avg_distance_km numeric(6,1),    -- distanza media casa-lavoro
  transport_mix   jsonb DEFAULT '{}',
    -- { "auto_benzina": 0.40, "auto_diesel": 0.20, "bus": 0.15, "treno": 0.15, "bici_piedi": 0.10 }
  source          text,            -- survey, stima HR, badge
  notes           text,
  created_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE hr_entries IS 'Dati HR per calcolo pendolarismo (Scope 3 cat. 3_3) e intensità';

-- ▸▸▸ 5. VSME_PARAMS — parametri aziendali annuali per KPI e normalizzazione
-- ============================================================================
CREATE TABLE IF NOT EXISTS vsme_params (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year          integer NOT NULL,
  employees     integer,
  revenue_eur   numeric(15,2),
  surface_m2    numeric(12,2),
  sector_nace   text,             -- codice NACE primario
  policies      jsonb DEFAULT '{}',
    -- { "environmental": true, "social": false, "governance": true, "details": "..." }
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT vsme_params_unique UNIQUE (company_id, year)
);

COMMENT ON TABLE vsme_params IS 'Parametri VSME annuali — dipendenti, fatturato, superficie per KPI';

-- ▸▸▸ 6. VISTA MATERIALIZZATA period_summary
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS period_summary AS
SELECT
  p.id            AS period_id,
  p.company_id,
  p.year,
  p.month,
  p.status,

  -- Scope 1 (da energy_entries)
  COALESCE(SUM(e.co2e_kg) FILTER (WHERE e.scope = 1), 0)
    AS scope1_co2e_kg,

  -- Scope 2 location-based
  COALESCE(SUM(e.co2e_kg) FILTER (WHERE e.scope = 2 AND e.approach = 'location'), 0)
    AS scope2_lb_co2e_kg,

  -- Scope 2 market-based
  COALESCE(SUM(e.co2e_kg) FILTER (WHERE e.scope = 2 AND e.approach = 'market'), 0)
    AS scope2_mb_co2e_kg,

  -- Scope 3 (da scope3_entries)
  COALESCE(s3_agg.scope3_co2e_kg, 0)
    AS scope3_co2e_kg,

  -- Totale (location-based)
  COALESCE(SUM(e.co2e_kg) FILTER (WHERE e.scope = 1), 0)
    + COALESCE(SUM(e.co2e_kg) FILTER (WHERE e.scope = 2 AND e.approach = 'location'), 0)
    + COALESCE(s3_agg.scope3_co2e_kg, 0)
    AS total_co2e_kg

FROM ghg_periods p
LEFT JOIN energy_entries e
  ON e.period_id = p.id
LEFT JOIN (
  SELECT period_id, SUM(COALESCE(co2e_kg, 0)) AS scope3_co2e_kg
  FROM scope3_entries
  WHERE period_id IS NOT NULL
  GROUP BY period_id
) s3_agg
  ON s3_agg.period_id = p.id
GROUP BY p.id, p.company_id, p.year, p.month, p.status, s3_agg.scope3_co2e_kg;

CREATE UNIQUE INDEX IF NOT EXISTS idx_period_summary_pk ON period_summary(period_id);
CREATE INDEX IF NOT EXISTS idx_period_summary_company_year ON period_summary(company_id, year);

COMMENT ON MATERIALIZED VIEW period_summary IS 'Aggregazione Scope 1+2+3 per periodo — REFRESH MATERIALIZED VIEW CONCURRENTLY period_summary';

-- ▸▸▸ 7. RLS — stesse policy permissive del resto dell'app
-- ============================================================================
ALTER TABLE ghg_periods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vsme_params    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON ghg_periods    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON energy_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON hr_entries     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON vsme_params    FOR ALL USING (true) WITH CHECK (true);

-- ▸▸▸ 8. TRIGGER updated_at per tabelle con aggiornamenti
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_ghg_periods ON ghg_periods;
CREATE TRIGGER set_updated_at_ghg_periods
  BEFORE UPDATE ON ghg_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_vsme_params ON vsme_params;
CREATE TRIGGER set_updated_at_vsme_params
  BEFORE UPDATE ON vsme_params FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ▸▸▸ 9. MIGRAZIONE DATI: ATTREZZATURE MECCANICHE FERRARI SRL
-- ============================================================================
-- Report: 0b25ccf1-655c-4c88-b9d5-ec201dbaa526  (year 2025, completato)
-- Company: c4c8b8ce-1bc6-4604-a9fa-a67f59dd7069
--
-- Inserisce come period month=NULL (dato annuale legacy)
-- ============================================================================

-- 9a. Crea il periodo annuale
INSERT INTO ghg_periods (company_id, report_id, year, month, status)
VALUES (
  'c4c8b8ce-1bc6-4604-a9fa-a67f59dd7069',
  '0b25ccf1-655c-4c88-b9d5-ec201dbaa526',
  2025,
  NULL,
  'closed'
)
ON CONFLICT (company_id, year, month) DO NOTHING;

-- 9b. Migra scope1_sources → energy_entries (scope=1)
INSERT INTO energy_entries (
  period_id, scope, source_category, source_label,
  quantity, unit, fe_value, fe_unit, fe_source,
  co2e_kg, data_quality, data_source, estimated, notes
)
SELECT
  p.id,
  1,
  s.source_category,
  s.source_label,
  s.activity_value,
  s.activity_unit,
  s.fe_value,
  s.fe_source_ref,
  COALESCE(s.fe_source_ref, 'legacy'),
  s.emissions_tco2e * 1000,     -- tCO2e → kgCO2e
  s.data_quality,
  s.data_quality,               -- data_source = data_quality per legacy
  false,
  s.notes
FROM scope1_sources s
JOIN ghg_periods p
  ON p.report_id = s.ghg_report_id AND p.month IS NULL
WHERE s.ghg_report_id = '0b25ccf1-655c-4c88-b9d5-ec201dbaa526';

-- 9c. Migra scope2_sources → energy_entries (scope=2, location-based)
INSERT INTO energy_entries (
  period_id, scope, source_category, source_label,
  quantity, unit, fe_value, fe_unit, fe_source,
  co2e_kg, data_quality, data_source, estimated,
  approach, market_instrument, pv_self_consumed_kwh, notes
)
SELECT
  p.id,
  2,
  s.source_category,
  s.source_label,
  s.activity_value_kwh,
  'kWh',
  s.fe_location_value,
  'tCO2e/kWh',
  s.fe_location_source,
  s.emissions_location_tco2e * 1000,
  s.data_quality,
  s.data_quality,
  false,
  'location',
  CASE WHEN s.contract_type = 'garanzia_origine' THEN 'go' ELSE 'none' END,
  s.pv_self_consumed_kwh,
  s.notes
FROM scope2_sources s
JOIN ghg_periods p
  ON p.report_id = s.ghg_report_id AND p.month IS NULL
WHERE s.ghg_report_id = '0b25ccf1-655c-4c88-b9d5-ec201dbaa526';

-- 9d. Riga market-based per lo stesso POD (se ha dati market)
INSERT INTO energy_entries (
  period_id, scope, source_category, source_label,
  quantity, unit, fe_value, fe_unit, fe_source,
  co2e_kg, data_quality, data_source, estimated,
  approach, market_instrument, pv_self_consumed_kwh, notes
)
SELECT
  p.id,
  2,
  s.source_category,
  s.source_label || ' (market)',
  s.activity_value_kwh,
  'kWh',
  s.fe_market_value,
  'tCO2e/kWh',
  s.fe_market_source,
  s.emissions_market_tco2e * 1000,
  s.data_quality,
  s.data_quality,
  false,
  'market',
  CASE
    WHEN s.contract_type = 'garanzia_origine' THEN 'go'
    WHEN s.contract_type = 'ppa' THEN 'ppa'
    ELSE 'none'
  END,
  s.pv_self_consumed_kwh,
  s.notes
FROM scope2_sources s
JOIN ghg_periods p
  ON p.report_id = s.ghg_report_id AND p.month IS NULL
WHERE s.ghg_report_id = '0b25ccf1-655c-4c88-b9d5-ec201dbaa526'
  AND s.emissions_market_tco2e IS NOT NULL;

-- 9e. Migra anche il secondo report (Claudio)
INSERT INTO ghg_periods (company_id, report_id, year, month, status)
VALUES (
  '985f6c46-1e5f-42f5-89f7-2da7da10bb15',
  '8d5bb258-cb0e-4eb9-b008-53cd56b041f9',
  2025,
  NULL,
  'closed'
)
ON CONFLICT (company_id, year, month) DO NOTHING;

INSERT INTO energy_entries (
  period_id, scope, source_category, source_label,
  quantity, unit, fe_value, fe_unit, fe_source,
  co2e_kg, data_quality, data_source, estimated, notes
)
SELECT
  p.id, 1, s.source_category, s.source_label,
  s.activity_value, s.activity_unit, s.fe_value, s.fe_source_ref,
  COALESCE(s.fe_source_ref, 'legacy'),
  s.emissions_tco2e * 1000, s.data_quality, s.data_quality, false, s.notes
FROM scope1_sources s
JOIN ghg_periods p ON p.report_id = s.ghg_report_id AND p.month IS NULL
WHERE s.ghg_report_id = '8d5bb258-cb0e-4eb9-b008-53cd56b041f9';

INSERT INTO energy_entries (
  period_id, scope, source_category, source_label,
  quantity, unit, fe_value, fe_unit, fe_source,
  co2e_kg, data_quality, data_source, estimated,
  approach, market_instrument, pv_self_consumed_kwh, notes
)
SELECT
  p.id, 2, s.source_category, s.source_label,
  s.activity_value_kwh, 'kWh', s.fe_location_value, 'tCO2e/kWh',
  s.fe_location_source,
  s.emissions_location_tco2e * 1000, s.data_quality, s.data_quality, false,
  'location', 'none', s.pv_self_consumed_kwh, s.notes
FROM scope2_sources s
JOIN ghg_periods p ON p.report_id = s.ghg_report_id AND p.month IS NULL
WHERE s.ghg_report_id = '8d5bb258-cb0e-4eb9-b008-53cd56b041f9';

-- 9f. Refresh della vista materializzata
REFRESH MATERIALIZED VIEW period_summary;

-- ============================================================================
-- FINE MIGRAZIONE
-- ============================================================================
