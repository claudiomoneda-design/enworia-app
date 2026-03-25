-- Migration: GHG modalità + step tracking + report type
ALTER TABLE ghg_reports ADD COLUMN IF NOT EXISTS modalita text DEFAULT 'standard';
ALTER TABLE ghg_reports ADD COLUMN IF NOT EXISTS iso_params jsonb;
ALTER TABLE ghg_reports ADD COLUMN IF NOT EXISTS step_corrente text DEFAULT 'modalita';
ALTER TABLE ghg_reports ADD COLUMN IF NOT EXISTS report_type text DEFAULT 'ghg_scope12';
