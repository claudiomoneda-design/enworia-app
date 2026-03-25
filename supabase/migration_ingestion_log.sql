-- ENWORIA — Ingestion log table
CREATE TABLE IF NOT EXISTS ingestion_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  period_id       uuid REFERENCES ghg_periods(id) ON DELETE SET NULL,
  filename        text,
  file_type       text,           -- elettricita, gas, csv, image
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','error')),
  parsed_fields   jsonb,          -- risultato parsing strutturato
  confidence_avg  numeric(4,3),
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON ingestion_log FOR ALL USING (true) WITH CHECK (true);

-- RPC per refresh materialized view
CREATE OR REPLACE FUNCTION refresh_period_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY period_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
