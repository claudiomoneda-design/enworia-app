-- Mobile combustion emission factors (machinery + heavy vehicles)
INSERT INTO emission_factors (category, substance, unit_input, fe_co2eq, gwp_source)
SELECT * FROM (VALUES
  ('vehicle', 'forklift_diesel',   'litri', 0.002650, 'IPCC AR6'),
  ('vehicle', 'forklift_lpg',     'litri', 0.001630, 'IPCC AR6'),
  ('vehicle', 'generator_diesel', 'litri', 0.002650, 'IPCC AR6'),
  ('vehicle', 'excavator_diesel', 'litri', 0.002750, 'IPCC AR6'),
  ('vehicle', 'truck_diesel',     'litri', 0.002650, 'IPCC AR6'),
  ('vehicle', 'van_diesel',       'litri', 0.002550, 'IPCC AR6'),
  ('vehicle', 'van_petrol',       'litri', 0.002310, 'IPCC AR6')
) AS new(category, substance, unit_input, fe_co2eq, gwp_source)
WHERE NOT EXISTS (
  SELECT 1 FROM emission_factors WHERE LOWER(substance) = LOWER(new.substance)
);

-- Add fuel_type column to scope1_sources for stationary combustion
ALTER TABLE scope1_sources
  ADD COLUMN IF NOT EXISTS fuel_type text;
