-- Disable RLS on scope3 tables (same pattern as other enworia tables)
ALTER TABLE scope3_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope3_screening ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope3_entries ENABLE ROW LEVEL SECURITY;

-- Allow all operations with anon key (same as other tables in this project)
CREATE POLICY "scope3_subcategories_all" ON scope3_subcategories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "scope3_screening_all" ON scope3_screening FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "scope3_entries_all" ON scope3_entries FOR ALL USING (true) WITH CHECK (true);
