-- ALTER TABLE per aggiungere i campi VSME General Information (B1 + B2)
-- Eseguire nella console SQL di Supabase

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS reporting_period_start date,
  ADD COLUMN IF NOT EXISTS reporting_period_end date,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS vsme_module text DEFAULT 'Basic',
  ADD COLUMN IF NOT EXISTS reporting_perimeter text,
  ADD COLUMN IF NOT EXISTS total_assets_eur numeric(15, 2),
  ADD COLUMN IF NOT EXISTS employee_unit text DEFAULT 'headcount',
  ADD COLUMN IF NOT EXISTS primary_country text DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS sites jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS subsidiaries jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS has_sustainability_policies boolean,
  ADD COLUMN IF NOT EXISTS policy_topics text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_esg_targets boolean,
  ADD COLUMN IF NOT EXISTS esg_targets_description text,
  ADD COLUMN IF NOT EXISTS has_transition_plan boolean,
  ADD COLUMN IF NOT EXISTS transition_plan_description text,
  ADD COLUMN IF NOT EXISTS certifications text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_report boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS previous_report_url text,
  ADD COLUMN IF NOT EXISTS form_status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz;
