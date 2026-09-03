-- Rodada de evolução funcional 09/2026 (item 2/5, comparação com sistema
-- de planilha "Frota 7.15") — histórico real de abastecimentos. Hoje
-- `calcular_combustivel` é puramente pontual (sem I/O, nunca grava nada) e
-- o consumo do veículo é sempre um valor manual salvo em
-- vehicles.average_consumption_km_l. Esta tabela permite calcular consumo
-- MEDIDO (litros ÷ km rodado entre abastecimentos consecutivos), sem mexer
-- na ferramenta pura existente.

create table public.fuel_fillups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  fillup_date date not null,
  liters numeric not null,
  price_per_liter numeric,
  total_amount numeric not null,
  odometer_km numeric,
  fuel_type public.fuel_type,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint fuel_fillups_liters_positive check (liters > 0),
  constraint fuel_fillups_total_amount_positive check (total_amount > 0),
  constraint fuel_fillups_price_per_liter_positive check (price_per_liter is null or price_per_liter > 0),
  constraint fuel_fillups_odometer_non_negative check (odometer_km is null or odometer_km >= 0)
);

comment on table public.fuel_fillups is
  'Um registro por evento de abastecimento — permite consumo médio MEDIDO (litros/km real entre leituras consecutivas de odometer_km), diferente do valor manual em vehicles.average_consumption_km_l. odometer_km é sempre informado manualmente, nunca lido automaticamente (sem telemetria, mesmo princípio de maintenance_schedules.executed_km). expenses.fuel_fillup_id (abaixo) vincula no máximo 1 despesa por abastecimento.';

create trigger set_updated_at
  before update on public.fuel_fillups
  for each row execute function public.set_updated_at();

create index fuel_fillups_vehicle_date_idx on public.fuel_fillups (vehicle_id, fillup_date);
create index fuel_fillups_company_date_idx on public.fuel_fillups (company_id, fillup_date);

alter table public.fuel_fillups enable row level security;

create policy fuel_fillups_select_member on public.fuel_fillups
  for select using (public.is_company_member(company_id));

create policy fuel_fillups_insert_operator on public.fuel_fillups
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy fuel_fillups_update_operator on public.fuel_fillups
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy fuel_fillups_delete_operator on public.fuel_fillups
  for delete using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

-- Vínculo opcional: um abastecimento pode gerar/atualizar UMA despesa
-- vinculada (categoria combustivel) — mesmo padrão de
-- expenses.maintenance_schedule_id (20260824030939_maintenance_km_and_expense_link.sql).
alter table public.expenses
  add column if not exists fuel_fillup_id uuid references public.fuel_fillups (id) on delete set null;

comment on column public.expenses.fuel_fillup_id is
  'Vincula a despesa ao abastecimento que a originou. Nulo para despesas de combustível sem abastecimento estruturado. No máximo 1 despesa por abastecimento (índice único parcial abaixo) — editar o valor de um abastecimento já vinculado atualiza a despesa existente em vez de criar outra.';

create unique index if not exists expenses_fuel_fillup_unique_idx
  on public.expenses (fuel_fillup_id)
  where fuel_fillup_id is not null;
