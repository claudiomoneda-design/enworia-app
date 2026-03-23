-- Fix RLS: ensure ghg_reports allows all operations
-- (The table may have RLS enabled without a permissive policy)

-- Drop any existing restrictive policies first
DO $$
BEGIN
  -- Enable RLS (idempotent)
  ALTER TABLE ghg_reports ENABLE ROW LEVEL SECURITY;

  -- Try to drop existing policy if it exists
  BEGIN
    DROP POLICY IF EXISTS "Allow all access" ON ghg_reports;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    DROP POLICY IF EXISTS "Allow all" ON ghg_reports;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Create permissive policy
CREATE POLICY "Allow all access" ON ghg_reports
  FOR ALL USING (true) WITH CHECK (true);

-- Also ensure the columns needed for autosave exist
ALTER TABLE ghg_reports
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
