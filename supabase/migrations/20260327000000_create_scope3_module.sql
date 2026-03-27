-- ============================================================
-- Scope 3 Module — ISO 14064-1:2019
-- Tabelle + seed sottocategorie + RLS
-- ============================================================

-- 1. scope3_subcategories — anagrafica fissa ISO 14064-1 Appendice B
CREATE TABLE scope3_subcategories (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_number  SMALLINT NOT NULL,
  subcategory_code TEXT NOT NULL UNIQUE,
  name_it          TEXT NOT NULL,
  description_it   TEXT,
  card_icon        TEXT,
  is_scope2_overlap BOOLEAN DEFAULT FALSE,
  sort_order       SMALLINT NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. scope3_screening — risposte wizard identificazione attività
CREATE TABLE scope3_screening (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id         UUID NOT NULL REFERENCES ghg_reports(id) ON DELETE CASCADE,
  subcategory_id    UUID NOT NULL REFERENCES scope3_subcategories(id),
  has_activity      BOOLEAN,
  data_availability TEXT CHECK (data_availability IN ('si','parziali','no')),
  data_source       TEXT,
  significance      TEXT CHECK (significance IN ('high','medium','low','na','scope2_included'))
                    DEFAULT 'na',
  score_a           SMALLINT,
  score_b           SMALLINT,
  score_c           SMALLINT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, subcategory_id)
);

-- 3. scope3_entries — dati emissivi (spend-based + activity-based)
CREATE TABLE scope3_entries (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id              UUID NOT NULL REFERENCES ghg_reports(id) ON DELETE CASCADE,
  subcategory_id         UUID NOT NULL REFERENCES scope3_subcategories(id),
  screening_id           UUID REFERENCES scope3_screening(id),
  spend_eur              NUMERIC(15,2),
  purchase_type          TEXT CHECK (purchase_type IN ('raw','fin','srv','mix')),
  has_category_detail    BOOLEAN DEFAULT FALSE,
  quantity_kg            NUMERIC(15,2),
  material_type          TEXT,
  supplier_name          TEXT,
  emission_factor        NUMERIC(15,6),
  emission_factor_source TEXT,
  emission_factor_method TEXT CHECK (emission_factor_method IN ('spend_based','activity_based')),
  co2e_tonnes            NUMERIC(15,4),
  precision_level        SMALLINT DEFAULT 1,
  data_source            TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, subcategory_id)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE scope3_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope3_screening     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope3_entries       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scope3_subcategories_read" ON scope3_subcategories
  FOR SELECT USING (true);
CREATE POLICY "scope3_screening_all" ON scope3_screening
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "scope3_entries_all" ON scope3_entries
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- SEED — 9 sottocategorie ISO 14064-1
-- ============================================================
INSERT INTO scope3_subcategories
  (category_number, subcategory_code, name_it, description_it, card_icon, is_scope2_overlap, sort_order)
VALUES
  (2, '2.1', 'Elettricità importata',
   'Emissioni dalla produzione di elettricità acquistata',
   'energy', TRUE, 10),
  (2, '2.2', 'Energia termica importata',
   'Calore, vapore, climatizzazione acquistati',
   'energy', TRUE, 20),
  (4, '4.1', 'Acquisto materiali e servizi',
   'Materie prime, prodotti e forniture dai fornitori',
   'shopping', FALSE, 30),
  (3, '3.1', 'Trasporto fornitori',
   'Consegne e spedizioni ricevute dai fornitori',
   'truck', FALSE, 40),
  (3, '3.5', 'Viaggi aziendali',
   'Trasferte del personale — aerei, treni, hotel',
   'plane', FALSE, 50),
  (3, '3.2', 'Trasporto verso clienti',
   'Consegne e spedizioni organizzate per i clienti',
   'arrow', FALSE, 60),
  (3, '3.3', 'Pendolarismo dipendenti',
   'Spostamenti casa-lavoro del personale',
   'person', FALSE, 70),
  (4, '4.3', 'Rifiuti prodotti',
   'Smaltimento rifiuti solidi e liquidi aziendali',
   'trash', FALSE, 80),
  (4, '4.2', 'Acquisti strumentali',
   'Macchinari, attrezzature e veicoli acquistati',
   'building', FALSE, 90);
