-- Base year support — ISO 14064-1 §5.3
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS base_year integer,
  ADD COLUMN IF NOT EXISTS base_year_recalculation jsonb DEFAULT '[]';
