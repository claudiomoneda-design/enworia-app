-- Schema per Enworia ESG Management Tool
-- Eseguire questo SQL nella console SQL di Supabase

create type counting_method as enum ('fine_periodo', 'media');

create table companies (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid,
  company_name text not null,
  legal_form text not null,
  nace_code text not null,
  nace_description text not null,
  number_of_employees integer not null,
  employee_counting_method counting_method not null default 'fine_periodo',
  turnover_eur numeric(15, 2) not null,
  reference_year integer not null,
  country text not null,
  registered_address text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Trigger per aggiornare updated_at automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_updated_at
  before update on companies
  for each row
  execute function update_updated_at();

-- RLS disabilitato per ora (niente autenticazione)
alter table companies enable row level security;

create policy "Allow all access"
  on companies
  for all
  using (true)
  with check (true);
