-- Autosave draft support for ghg_reports
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS step_reached integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}';

-- Ensure status column exists with correct default
-- (status column already exists but may have old default)
ALTER TABLE ghg_reports
  ALTER COLUMN status SET DEFAULT 'bozza';
