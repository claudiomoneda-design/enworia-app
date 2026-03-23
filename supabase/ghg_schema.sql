-- GHG Module Schema
-- Tabelle: ghg_reports, scope1_sources, scope2_sources, emission_factors
-- Eseguire nella console SQL di Supabase (se non già create)

CREATE TABLE IF NOT EXISTS ghg_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year integer NOT NULL,
  perimeter text NOT NULL DEFAULT 'individuale',
  included_entities text DEFAULT '',
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  total_scope1_tco2e numeric(15,6),
  total_scope2_tco2e numeric(15,6),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope1_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ghg_reports(id) ON DELETE CASCADE,
  source_type text NOT NULL, -- gas_naturale, carburante, hfc
  site_name text,
  monthly_values jsonb DEFAULT '[]',
  unit text, -- sm3, mwh
  plate text,
  fuel_type text, -- benzina, gasolio, gpl, metano
  liters_annual numeric(12,2),
  km_annual numeric(12,2),
  usage_category text, -- aziendale, fringe_benefit, privato
  gas_name text,
  kg_annual numeric(12,4),
  data_quality text NOT NULL DEFAULT 'stima_ragionata',
  ef_mode text NOT NULL DEFAULT 'standard',
  ef_value numeric(15,8),
  ef_unit text,
  ef_reference text,
  ef_uncertainty numeric(5,2),
  data_uncertainty numeric(5,2),
  tco2e numeric(15,6),
  combined_uncertainty numeric(5,2),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scope2_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ghg_reports(id) ON DELETE CASCADE,
  pod_code text DEFAULT '',
  contract_type text DEFAULT 'mercato_libero',
  monthly_values jsonb DEFAULT '[]',
  fv_self_consumed numeric(12,2),
  data_quality text NOT NULL DEFAULT 'stima_ragionata',
  ef_mode text NOT NULL DEFAULT 'standard',
  ef_value numeric(15,8),
  ef_unit text,
  ef_reference text,
  ef_uncertainty numeric(5,2),
  data_uncertainty numeric(5,2),
  tco2e numeric(15,6),
  combined_uncertainty numeric(5,2),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emission_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  subcategory text NOT NULL,
  unit text NOT NULL,
  factor_value numeric(15,8) NOT NULL,
  uncertainty_pct numeric(5,2) NOT NULL DEFAULT 5,
  source text NOT NULL,
  year integer NOT NULL
);

-- RLS policies (stesse di companies)
ALTER TABLE ghg_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope1_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope2_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE emission_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON ghg_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON scope1_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON scope2_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON emission_factors FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at per ghg_reports
CREATE OR REPLACE TRIGGER set_updated_at_ghg_reports
  BEFORE UPDATE ON ghg_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
