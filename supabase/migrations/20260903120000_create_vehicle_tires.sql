-- Rodada de evolução funcional 09/2026 (item 3/5, comparação com sistema
-- de planilha "Frota 7.15") — rastreamento de PNEU FÍSICO individual.
-- vehicle_tire_profiles (Camada 3) já cobre "premissas de custo/comparação
-- de opções de pneu" para calcular_cpk/comparar_pneus, mas o comentário da
-- própria tabela já dizia: "NÃO é gestão completa de pneus: sem posição por
-- eixo, estoque, movimentação ou sucata — isso pertence a versões
-- futuras". Esta tabela é essa versão futura, sem duplicar o que já existe
-- (tire_profile_id reaproveita marca/modelo/custo já cadastrado, quando o
-- cliente linkar um perfil salvo).

create type public.vehicle_tire_status as enum ('montado', 'estoque', 'manutencao', 'sucateado');

create table public.vehicle_tires (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  tire_profile_id uuid references public.vehicle_tire_profiles (id) on delete set null,
  position text,
  brand text,
  model text,
  status public.vehicle_tire_status not null default 'estoque',
  mounted_at date,
  mounted_km numeric,
  last_checked_km numeric,
  expected_life_km numeric,
  removed_at date,
  removal_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint vehicle_tires_mounted_km_non_negative check (mounted_km is null or mounted_km >= 0),
  constraint vehicle_tires_last_checked_km_non_negative check (last_checked_km is null or last_checked_km >= 0),
  constraint vehicle_tires_expected_life_km_non_negative check (expected_life_km is null or expected_life_km >= 0),
  constraint vehicle_tires_montado_requires_vehicle check (status <> 'montado' or vehicle_id is not null)
);

comment on table public.vehicle_tires is
  'Pneu físico individual — posição, status, km de montagem e última leitura de km informada (nunca telemetria/leitura automática, mesmo princípio de maintenance_schedules.executed_km). Km rodado/restante são calculados na leitura (service), não guardados aqui, pra nunca ficar inconsistente com last_checked_km. tire_profile_id reaproveita marca/modelo/custo de vehicle_tire_profiles quando o cliente linkar um perfil salvo — brand/model aqui são o fallback pra quem não linkar.';

create trigger set_updated_at
  before update on public.vehicle_tires
  for each row execute function public.set_updated_at();

create index vehicle_tires_company_idx on public.vehicle_tires (company_id);
create index vehicle_tires_vehicle_idx on public.vehicle_tires (vehicle_id) where vehicle_id is not null;

alter table public.vehicle_tires enable row level security;

create policy vehicle_tires_select_member on public.vehicle_tires
  for select using (public.is_company_member(company_id));

create policy vehicle_tires_insert_operator on public.vehicle_tires
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vehicle_tires_update_operator on public.vehicle_tires
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy vehicle_tires_delete_admin on public.vehicle_tires
  for delete using (public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));

-- Integração com Alertas: quando ATUALIZAR_KM deixa km_restante abaixo do
-- limiar, sincroniza um alerta automático — mesmo mecanismo já usado por
-- manutenção/documento (scheduled_alerts_source_at_most_one, criado em
-- 20260813190600_extend_scheduled_alerts_for_central.sql).
alter table public.scheduled_alerts
  add column vehicle_tire_id uuid references public.vehicle_tires (id) on delete cascade;

alter table public.scheduled_alerts drop constraint scheduled_alerts_source_at_most_one;

alter table public.scheduled_alerts add constraint scheduled_alerts_source_at_most_one check (
  (maintenance_schedule_id is not null)::int + (vehicle_document_id is not null)::int + (vehicle_tire_id is not null)::int <= 1
);

create unique index if not exists scheduled_alerts_vehicle_tire_unique_idx
  on public.scheduled_alerts (vehicle_tire_id)
  where vehicle_tire_id is not null and status <> 'cancelled';
