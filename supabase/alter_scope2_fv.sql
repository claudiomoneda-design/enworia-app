-- Add FV (fotovoltaico) fields to scope2_sources — ISO 14064-1 §6.5
ALTER TABLE scope2_sources
  ADD COLUMN IF NOT EXISTS fv_production_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fv_autoconsumato_kwh numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fv_go_vendute boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fv_immesso_kwh numeric(12,2) DEFAULT 0;
