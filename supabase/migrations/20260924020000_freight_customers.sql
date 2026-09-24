begin;
-- Cadastro independente: não altera receitas, pesagens, veículos ou motoristas.
create table public.freight_customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (length(trim(name)) between 2 and 160),
  legal_name text check (length(legal_name) <= 200),
  cnpj text check (cnpj ~ '^[0-9]{14}$'),
  address text check (length(address) <= 300),
  city text check (length(city) <= 100),
  state text check (state ~ '^[A-Z]{2}$'),
  closing_day integer check (closing_day between 1 and 31),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index freight_customers_name_unique on public.freight_customers(company_id, lower(trim(name)));
create unique index freight_customers_cnpj_unique on public.freight_customers(company_id,cnpj) where cnpj is not null;
create trigger set_updated_at before update on public.freight_customers for each row execute function public.set_updated_at();
alter table public.freight_customers enable row level security;
create policy freight_customers_read on public.freight_customers for select to authenticated using (public.is_company_member(company_id));
create policy freight_customers_insert on public.freight_customers for insert to authenticated with check (public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
create policy freight_customers_update on public.freight_customers for update to authenticated using (public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[])) with check (public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
grant select,insert,update on public.freight_customers to authenticated;
grant all on public.freight_customers to service_role;
commit;

