-- Rename year → reference_year if needed, then add unique constraint
-- Step 1: Add reference_year column if it doesn't exist
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS reference_year integer;

-- Step 2: Copy data from year to reference_year if year exists and reference_year is null
UPDATE ghg_reports SET reference_year = year WHERE reference_year IS NULL AND year IS NOT NULL;

-- Step 3: Add unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ghg_reports_company_refyear_unique'
  ) THEN
    ALTER TABLE ghg_reports
      ADD CONSTRAINT ghg_reports_company_refyear_unique UNIQUE (company_id, reference_year);
  END IF;
END $$;
