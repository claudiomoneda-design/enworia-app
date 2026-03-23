-- Report code unique identifier
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS report_code text UNIQUE;
