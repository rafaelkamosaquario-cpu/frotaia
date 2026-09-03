-- Rodada de evolução funcional 09/2026 (item 1/5, comparação com sistema
-- de planilha "Frota 7.15") — cadastro estruturado de posto de combustível
-- e fornecedor (oficina/peças), hoje só existe como texto livre em
-- expenses.vendor. Tabela genérica (category) em vez de duas tabelas quase
-- idênticas — cobre os dois casos da planilha original (CD_Posto/CD_Fornecedor).

create type public.vendor_category as enum (
  'posto_combustivel',
  'oficina_mecanica',
  'fornecedor_pecas',
  'outro'
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  category public.vendor_category not null default 'outro',
  address text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

comment on table public.vendors is
  'Posto de combustível ou fornecedor (oficina/peças) cadastrado pela empresa — reaproveitado por fuel_fillups.vendor_id e opcionalmente expenses.vendor_id. expenses.vendor (texto livre) continua existindo à parte, sem obrigar vínculo estruturado.';

create trigger set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create index vendors_company_idx on public.vendors (company_id) where active;

alter table public.vendors enable row level security;

create policy vendors_select_member on public.vendors
  for select using (public.is_company_member(company_id));

create policy vendors_insert_operator on public.vendors
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vendors_update_operator on public.vendors
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vendors_delete_admin on public.vendors
  for delete using (public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));

-- Vínculo opcional: uma despesa pode referenciar um fornecedor estruturado,
-- sem obrigar (expenses.vendor continua aceitando texto livre como sempre).
alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors (id) on delete set null;

comment on column public.expenses.vendor_id is
  'Vínculo opcional a um fornecedor/posto cadastrado (public.vendors). Nulo para despesas com fornecedor só em texto livre (coluna vendor).';
