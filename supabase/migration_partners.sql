-- ============================================================================
-- MIGRATION: Partners & Revenue Events
-- ============================================================================

-- 1. PARTNERS
CREATE TABLE IF NOT EXISTS partners (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  email             text,
  level             text NOT NULL DEFAULT 'starter',
  revenue_share_pct numeric(5,2) NOT NULL DEFAULT 20,
  min_price_eur     numeric(10,2) NOT NULL DEFAULT 149,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON partners FOR ALL USING (true) WITH CHECK (true);

-- 2. partner_id su companies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'partner_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. REVENUE_EVENTS
CREATE TABLE IF NOT EXISTS revenue_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid REFERENCES companies(id) ON DELETE CASCADE,
  partner_id       uuid REFERENCES partners(id) ON DELETE SET NULL,
  period_id        uuid REFERENCES ghg_periods(id) ON DELETE SET NULL,
  amount_eur       numeric(10,2),
  partner_share_eur numeric(10,2),
  status           text NOT NULL DEFAULT 'pending',
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON revenue_events FOR ALL USING (true) WITH CHECK (true);
