-- Add contact/responsible fields to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS responsible_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text;
