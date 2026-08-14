-- Plano de unificação V1+V2, Fase 8: jornada operacional salva, distinta
-- de simulação. calcular_jornada (WhatsApp) é pura e sempre grava em
-- analysis_runs — esta tabela é só pra quando o cliente quer usar a
-- jornada de verdade (não é gravação automática de toda simulação).

create type public.journey_status as enum ('planejada', 'em_andamento', 'concluida', 'cancelada');

create table public.saved_journeys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_by_user_id uuid references auth.users (id),
  origin text,
  destination text,
  scheduled_departure timestamptz,
  scheduled_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  duration_minutes integer,
  status public.journey_status not null default 'planejada',
  result_data jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.saved_journeys is
  'Jornada operacional salva a pedido do cliente — distinta de calcular_jornada (sempre pura, sempre grava em analysis_runs). Criada só via gerenciar_jornada_salva (WhatsApp), painel é só leitura por enquanto.';

create trigger set_updated_at
  before update on public.saved_journeys
  for each row execute function public.set_updated_at();

create index saved_journeys_company_id_idx on public.saved_journeys (company_id);
create index saved_journeys_vehicle_id_idx on public.saved_journeys (vehicle_id) where vehicle_id is not null;
create index saved_journeys_driver_id_idx on public.saved_journeys (driver_id) where driver_id is not null;
create index saved_journeys_status_idx on public.saved_journeys (company_id, status);

alter table public.saved_journeys enable row level security;

create policy saved_journeys_select_member on public.saved_journeys
  for select using (public.is_company_member(company_id));

-- Sem policy de insert/update/delete: só o client admin escreve, via a
-- ferramenta gerenciar_jornada_salva — mesmo padrão de scheduled_alerts.
