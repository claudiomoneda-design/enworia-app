-- ============================================================
-- 1. Alter scope2_sources: add site_name and country columns
-- ============================================================
ALTER TABLE scope2_sources
  ADD COLUMN IF NOT EXISTS site_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'IT';

-- ============================================================
-- 2. Ensure emission_factors has the needed columns
--    (may already exist from insert_hfc_ar6.sql)
-- ============================================================
ALTER TABLE emission_factors
  ADD COLUMN IF NOT EXISTS substance text,
  ADD COLUMN IF NOT EXISTS unit_input text,
  ADD COLUMN IF NOT EXISTS fe_co2eq numeric(15,6),
  ADD COLUMN IF NOT EXISTS gwp_source text,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- 3. Insert IEA 2023 electricity emission factors (skip dupes)
-- ============================================================
INSERT INTO emission_factors (category, substance, unit_input, fe_co2eq, gwp_source, notes)
SELECT * FROM (VALUES
  ('electricity', 'grid_pl_location_2023', 'kWh', 0.000720, 'IEA 2023', 'Polonia'),
  ('electricity', 'grid_ro_location_2023', 'kWh', 0.000310, 'IEA 2023', 'Romania'),
  ('electricity', 'grid_ch_location_2023', 'kWh', 0.000045, 'IEA 2023', 'Svizzera'),
  ('electricity', 'grid_uk_location_2023', 'kWh', 0.000225, 'IEA 2023', 'Regno Unito'),
  ('electricity', 'grid_us_location_2023', 'kWh', 0.000386, 'IEA 2023', 'USA'),
  ('electricity', 'grid_cn_location_2023', 'kWh', 0.000581, 'IEA 2023', 'Cina'),
  ('electricity', 'grid_br_location_2023', 'kWh', 0.000074, 'IEA 2023', 'Brasile'),
  ('electricity', 'grid_in_location_2023', 'kWh', 0.000708, 'IEA 2023', 'India'),
  ('electricity', 'grid_world_avg_2023',   'kWh', 0.000494, 'IEA 2023', 'Media mondiale IEA (fallback)')
) AS new(category, substance, unit_input, fe_co2eq, gwp_source, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM emission_factors WHERE LOWER(substance) = LOWER(new.substance)
);
