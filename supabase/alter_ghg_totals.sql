-- Computed totals for GHG report listing
ALTER TABLE ghg_reports
  ADD COLUMN IF NOT EXISTS scope1_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope2_lb_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope2_mb_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_co2eq numeric DEFAULT 0;
