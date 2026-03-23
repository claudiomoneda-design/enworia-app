-- ============================================================
-- 1. Alter emission_factors: add columns needed for HFC AR6 data
--    (safe: IF NOT EXISTS)
-- ============================================================
ALTER TABLE emission_factors
  ADD COLUMN IF NOT EXISTS substance text,
  ADD COLUMN IF NOT EXISTS unit_input text,
  ADD COLUMN IF NOT EXISTS fe_co2eq numeric(15,6),
  ADD COLUMN IF NOT EXISTS gwp_source text,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- ============================================================
-- 2. Insert IPCC AR6 refrigerant gases (skip if substance exists)
-- ============================================================
INSERT INTO emission_factors (category, substance, unit_input, fe_co2eq, gwp_source, is_default)
SELECT * FROM (VALUES
  ('hfc', 'R-23',     'kg', 14.800, 'IPCC AR6', true),
  ('hfc', 'R-41',     'kg', 0.220,  'IPCC AR6', true),
  ('hfc', 'R-125',    'kg', 3.740,  'IPCC AR6', true),
  ('hfc', 'R-143a',   'kg', 5.810,  'IPCC AR6', true),
  ('hfc', 'R-152a',   'kg', 0.164,  'IPCC AR6', true),
  ('hfc', 'R-227ea',  'kg', 3.600,  'IPCC AR6', true),
  ('hfc', 'R-236fa',  'kg', 8.690,  'IPCC AR6', true),
  ('hfc', 'R-245fa',  'kg', 0.962,  'IPCC AR6', true),
  ('hfc', 'R-407A',   'kg', 2.107,  'IPCC AR6', true),
  ('hfc', 'R-407H',   'kg', 1.495,  'IPCC AR6', true),
  ('hfc', 'R-408A',   'kg', 3.152,  'IPCC AR6', true),
  ('hfc', 'R-422D',   'kg', 2.729,  'IPCC AR6', true),
  ('hfc', 'R-427A',   'kg', 2.138,  'IPCC AR6', true),
  ('hfc', 'R-438A',   'kg', 2.265,  'IPCC AR6', true),
  ('hfc', 'R-442A',   'kg', 1.888,  'IPCC AR6', true),
  ('hfc', 'R-450A',   'kg', 0.605,  'IPCC AR6', true),
  ('hfc', 'R-452B',   'kg', 0.698,  'IPCC AR6', true),
  ('hfc', 'R-454B',   'kg', 0.466,  'IPCC AR6', true),
  ('hfc', 'R-454C',   'kg', 0.148,  'IPCC AR6', true),
  ('hfc', 'R-455A',   'kg', 0.148,  'IPCC AR6', true),
  ('hfc', 'R-513A',   'kg', 0.573,  'IPCC AR6', true),
  ('hfc', 'R-1233zd', 'kg', 0.001,  'IPCC AR6', true),
  ('hfc', 'R-1336mzz','kg', 0.002,  'IPCC AR6', true),
  ('hfc', 'PFC-14',   'kg', 7.380,  'IPCC AR6', true),
  ('hfc', 'PFC-116',  'kg', 12.400, 'IPCC AR6', true),
  ('hfc', 'NF3',      'kg', 17.400, 'IPCC AR6', true)
) AS new(category, substance, unit_input, fe_co2eq, gwp_source, is_default)
WHERE NOT EXISTS (
  SELECT 1 FROM emission_factors
  WHERE LOWER(emission_factors.substance) = LOWER(new.substance)
);
