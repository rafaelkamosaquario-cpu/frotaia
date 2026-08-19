-- Radar de Fretes (MVP) — schema completo: fontes autorizadas, buscas
-- ativas do cliente, oportunidades recebidas, e o cruzamento por empresa.
-- Ver docs/FROTA_IA_RADAR_FRETES_MVP.md para a arquitetura completa.

-- ── Enums ────────────────────────────────────────────────────────────────

create type public.freight_source_type as enum ('whatsapp_group', 'fretebras', 'truckpad', 'api_partner');

create type public.freight_radar_status as enum ('active', 'paused', 'expired', 'cancelled');

create type public.freight_opportunity_source as enum ('direct_whatsapp', 'whatsapp_group', 'fretebras', 'truckpad', 'api_partner');

create type public.freight_opportunity_status as enum ('new', 'incomplete', 'expired', 'discarded');

create type public.freight_match_status as enum ('new', 'notified', 'viewed', 'analyzed', 'favorited', 'ignored', 'expired');

-- ── freight_sources ──────────────────────────────────────────────────────
-- Whitelist de grupos de WhatsApp (e futuras fontes) autorizados a alimentar
-- o Radar. company_id nulo = fonte GLOBAL (serve várias empresas ao mesmo
-- tempo, ex.: um grupo geral de fretes do setor) — gerenciada só pelo
-- backend (sem policy de escrita para authenticated quando company_id é
-- nulo). company_id preenchido = fonte privada da empresa, gerenciável pelo
-- próprio owner/admin via painel.

create table public.freight_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  source_type public.freight_source_type not null default 'whatsapp_group',
  group_external_id text not null,
  group_name text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint freight_sources_group_external_id_not_blank check (btrim(group_external_id) <> '')
);

comment on table public.freight_sources is
  'Whitelist de fontes externas autorizadas a alimentar o Radar de Fretes (hoje só grupos de WhatsApp). company_id nulo = fonte global, gerenciada só pelo backend.';
comment on column public.freight_sources.group_external_id is
  'Identificador do grupo no Z-API (campo "phone" do payload, ex.: "120363019502650977-group") — nunca um telefone de pessoa.';

create unique index freight_sources_group_unique on public.freight_sources (source_type, group_external_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index freight_sources_company_idx on public.freight_sources (company_id) where company_id is not null;
create index freight_sources_enabled_idx on public.freight_sources (group_external_id) where enabled = true;

create trigger set_updated_at before update on public.freight_sources for each row execute function public.set_updated_at();

-- ── freight_radars ───────────────────────────────────────────────────────
-- Busca ativa do cliente ("quero carga de Goiânia pra Curitiba"). Nunca
-- guarda cópia de dado do veículo — só vehicle_id, consultado na hora do
-- matching/análise (evita usar dado desatualizado).

create table public.freight_radars (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  origin_city text,
  origin_state text,
  destination_city text,
  destination_state text,
  destination_region_label text,
  available_from date,
  available_until date,
  status public.freight_radar_status not null default 'active',
  notes text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  constraint freight_radars_state_upper check (origin_state is null or origin_state = upper(origin_state)),
  constraint freight_radars_dest_state_upper check (destination_state is null or destination_state = upper(destination_state))
);

comment on table public.freight_radars is
  'Busca ativa de carga do cliente. expires_at é sempre obrigatório (nunca radar eterno) — default de 7 dias aplicado em código quando o cliente não informa prazo.';

create index freight_radars_company_status_idx on public.freight_radars (company_id, status) where status = 'active';
create index freight_radars_expires_idx on public.freight_radars (expires_at) where status = 'active';

create trigger set_updated_at before update on public.freight_radars for each row execute function public.set_updated_at();

-- ── freight_opportunities ────────────────────────────────────────────────
-- A carga recebida — NÃO é por empresa (uma oportunidade de fonte global
-- pode servir várias empresas ao mesmo tempo). Isolamento por empresa
-- acontece em freight_opportunity_matches, não aqui.

create table public.freight_opportunities (
  id uuid primary key default gen_random_uuid(),
  source public.freight_opportunity_source not null,
  source_group_id text,
  source_group_name text,
  original_message_id text,
  original_text text not null,
  origin_city text,
  origin_state text,
  destination_city text,
  destination_state text,
  pickup_date date,
  body_type public.vehicle_body_type,
  weight_kg numeric,
  freight_value_cents integer,
  contact_text text,
  extraction_confidence jsonb not null default '{}'::jsonb,
  status public.freight_opportunity_status not null default 'new',
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  constraint freight_opportunities_weight_non_negative check (weight_kg is null or weight_kg >= 0),
  constraint freight_opportunities_value_non_negative check (freight_value_cents is null or freight_value_cents >= 0)
);

comment on table public.freight_opportunities is
  'Carga recebida (fonte direta ou grupo autorizado). Nunca vinculada a company_id — o isolamento por empresa é feito em freight_opportunity_matches. Sem policy de select para authenticated: só o backend (client admin) lê/escreve, o painel sempre acessa via match da própria empresa.';
comment on column public.freight_opportunities.raw_payload is
  'Payload bruto da mensagem de origem, para auditoria/depuração — nunca exposto ao cliente final.';

create index freight_opportunities_status_idx on public.freight_opportunities (status, captured_at desc);
create index freight_opportunities_origin_dest_idx on public.freight_opportunities (origin_state, destination_state);
create unique index freight_opportunities_dedup_idx on public.freight_opportunities (source_group_id, original_message_id) where source_group_id is not null and original_message_id is not null;

-- ── freight_opportunity_matches ──────────────────────────────────────────
-- O cruzamento privado por empresa: esta oportunidade específica combina
-- com este radar específico desta empresa. Aqui sim é isolado por RLS.

create table public.freight_opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.freight_opportunities (id) on delete cascade,
  radar_id uuid not null references public.freight_radars (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  compatibility_score smallint not null,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  status public.freight_match_status not null default 'new',
  notified_at timestamptz,
  viewed_at timestamptz,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint freight_opportunity_matches_score_range check (compatibility_score between 0 and 100),
  constraint freight_opportunity_matches_unique unique (opportunity_id, radar_id)
);

comment on table public.freight_opportunity_matches is
  'Cruzamento privado por empresa entre uma oportunidade e um radar — é aqui que mora score, análise (analysis_run_id) e decisão do cliente. Isolado por company_id via RLS normal (is_company_member).';

create index freight_opportunity_matches_company_status_idx on public.freight_opportunity_matches (company_id, status);

create trigger set_updated_at before update on public.freight_opportunity_matches for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.freight_sources enable row level security;

create policy freight_sources_select_company_or_global on public.freight_sources
  for select using (company_id is null or public.is_company_member(company_id));

create policy freight_sources_insert_company_admin on public.freight_sources
  for insert with check (company_id is not null and public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));

create policy freight_sources_update_company_admin on public.freight_sources
  for update using (company_id is not null and public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]))
  with check (company_id is not null and public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));

create policy freight_sources_delete_company_admin on public.freight_sources
  for delete using (company_id is not null and public.has_company_role(company_id, array['owner', 'admin']::public.company_member_role[]));

-- Fontes globais (company_id nulo): sem policy de insert/update/delete para
-- authenticated — só o backend (client admin) cadastra.

alter table public.freight_radars enable row level security;

create policy freight_radars_select_member on public.freight_radars
  for select using (public.is_company_member(company_id));

create policy freight_radars_insert_operator on public.freight_radars
  for insert with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy freight_radars_update_operator on public.freight_radars
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

create policy freight_radars_delete_operator on public.freight_radars
  for delete using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

-- freight_opportunities: sem NENHUMA policy para authenticated (mesmo
-- padrão de payment_events/trial_usage) — só client admin lê/escreve. O
-- painel nunca consulta esta tabela direto, sempre via freight_opportunity_matches.
alter table public.freight_opportunities enable row level security;

alter table public.freight_opportunity_matches enable row level security;

create policy freight_opportunity_matches_select_member on public.freight_opportunity_matches
  for select using (public.is_company_member(company_id));

create policy freight_opportunity_matches_update_operator on public.freight_opportunity_matches
  for update using (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]))
  with check (public.has_company_role(company_id, array['owner', 'admin', 'operator']::public.company_member_role[]));

-- Sem policy de insert para authenticated: matches são criados só pelo
-- motor de matching (backend/client admin) — cliente nunca cria match
-- manualmente, só atualiza status (favoritar/ignorar) via update acima.
