CREATE TABLE IF NOT EXISTS vsme_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  client_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  anno integer NOT NULL,
  status text DEFAULT 'bozza',
  ghg_report_id uuid REFERENCES ghg_reports(id),
  ghg_manual_scope1 numeric,
  ghg_manual_scope2 numeric,
  ghg_manual_source text,
  form_data jsonb DEFAULT '{}',
  step_reached integer DEFAULT 1
);

-- RLS policy
ALTER TABLE vsme_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON vsme_reports FOR ALL USING (true) WITH CHECK (true);
