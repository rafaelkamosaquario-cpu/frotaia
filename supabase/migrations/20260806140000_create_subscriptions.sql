-- Fase 1 do fluxo de pagamento (Mercado Pago) — estado de assinatura da
-- empresa. 1 linha por empresa representando o estado ATUAL (mesmo padrão
-- de company_preferences); payment_events é log bruto de cada notificação
-- de webhook recebida (auditoria/disputa, nunca fonte de verdade de
-- acesso — isso é sempre subscriptions.status/valido_ate). trial_usage
-- garante "1 teste grátis por número de WhatsApp" mesmo que a empresa seja
-- excluída/recriada.

create type public.subscription_plan as enum ('TRIAL', 'MENSAL', 'ANUAL_PARCELADO', 'ANUAL_PIX', 'EMPRESA');
create type public.subscription_status as enum ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'CANCELADA', 'EXPIRADA');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  plan public.subscription_plan not null default 'TRIAL',
  status public.subscription_status not null default 'TRIAL',
  valor_centavos integer,
  mercadopago_subscription_id text,
  mercadopago_payment_id text,
  trial_iniciado_em timestamptz,
  trial_avisado_dia5 boolean not null default false,
  trial_avisado_ultimo_dia boolean not null default false,
  iniciado_em timestamptz,
  valido_ate timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_company_unique unique (company_id)
);

comment on table public.subscriptions is
  'Estado atual da assinatura da empresa (1 linha por empresa). status/valido_ate controlam o gating de acesso às ferramentas do Frota IA.';

create trigger set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create index subscriptions_status_valido_idx on public.subscriptions (status, valido_ate);

alter table public.subscriptions enable row level security;

create policy subscriptions_select_member on public.subscriptions
  for select using (public.is_company_member(company_id));

-- Sem policy de insert/update/delete: só o backend (client admin) grava,
-- via onboarding (cria TRIAL) e via o webhook do Mercado Pago.

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  provider text not null default 'mercadopago',
  event_type text not null,
  mercadopago_payment_id text,
  status_recebido text,
  payload_json jsonb,
  received_at timestamptz not null default now()
);

comment on table public.payment_events is
  'Log bruto de cada notificação de pagamento recebida via webhook — auditoria/suporte a disputa. Sem policy de select: leitura só pelo client admin (pode conter dado de payer devolvido pelo Mercado Pago).';

alter table public.payment_events enable row level security;

create table public.trial_usage (
  phone_e164 text primary key,
  company_id uuid references public.companies (id) on delete set null,
  used_at timestamptz not null default now()
);

comment on table public.trial_usage is
  'Garante 1 teste grátis por número de WhatsApp, checado antes de criar uma nova assinatura TRIAL no onboarding — mesmo que a empresa anterior tenha sido excluída. Sem policy de select/insert: só o client admin acessa.';

alter table public.trial_usage enable row level security;
