-- ═══════════════════════════════════════════════════
-- COMPREHENSIVE MIGRATION — run this to ensure all
-- columns exist for the current codebase
-- ═══════════════════════════════════════════════════

-- ghg_reports
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS reference_year integer,
  ADD COLUMN IF NOT EXISTS report_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS step_reached integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS base_year integer,
  ADD COLUMN IF NOT EXISTS base_year_recalculation jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS consolidation_approach text DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS entities jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS scope1_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope2_lb_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope2_mb_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_co2eq numeric DEFAULT 0;

-- Copy year → reference_year for existing rows
UPDATE ghg_reports SET reference_year = year
WHERE reference_year IS NULL AND year IS NOT NULL;

-- Unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ghg_reports_company_refyear_unique'
  ) THEN
    ALTER TABLE ghg_reports
      ADD CONSTRAINT ghg_reports_company_refyear_unique UNIQUE (company_id, reference_year);
  END IF;
END $$;

-- RLS
ALTER TABLE ghg_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON ghg_reports;
CREATE POLICY "Allow all access" ON ghg_reports FOR ALL USING (true) WITH CHECK (true);

-- scope1_sources
ALTER TABLE scope1_sources
  ADD COLUMN IF NOT EXISTS fuel_type text;

-- scope2_sources
ALTER TABLE scope2_sources
  ADD COLUMN IF NOT EXISTS site_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS has_fv boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fv_production_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fv_autoconsumato_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fv_go_vendute boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fv_immesso_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_instrument text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS market_certified_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_ppa_coverage numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_supplier_ef numeric(15,8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_emissions numeric(15,6) DEFAULT 0;

-- vsme_reports
CREATE TABLE IF NOT EXISTS vsme_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  anno integer NOT NULL,
  status text DEFAULT 'bozza',
  ghg_report_id uuid REFERENCES ghg_reports(id),
  ghg_manual_scope1 numeric,
  ghg_manual_scope2 numeric,
  ghg_manual_source text,
  form_data jsonb DEFAULT '{}',
  step_reached integer DEFAULT 1
);
ALTER TABLE vsme_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON vsme_reports;
CREATE POLICY "Allow all access" ON vsme_reports FOR ALL USING (true) WITH CHECK (true);
