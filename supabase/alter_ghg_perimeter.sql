-- Add consolidation approach and entities to ghg_reports
-- ISO 14064-1 §5.2 organizational boundary

ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS consolidation_approach text NOT NULL DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS entities jsonb DEFAULT '[]';
