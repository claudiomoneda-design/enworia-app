ALTER TABLE scope2_sources
  ADD COLUMN IF NOT EXISTS has_fv boolean DEFAULT false;
