-- V2 (gestão de frota) — Fase 1: schema, sem UI ainda.
-- vehicles_one_active_per_company_idx travava 1 veículo ativo por empresa
-- pra QUALQUER tipo — vira trigger porque Postgres não permite índice único
-- condicionado a coluna de outra tabela (companies.company_type). Só
-- empresa 'transportadora' (já existe no enum, sem uso real até aqui)
-- destrava múltiplos veículos; autônomo continua exatamente como sempre foi.

drop index public.vehicles_one_active_per_company_idx;

create or replace function public.enforce_one_vehicle_for_individual_accounts()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  tipo_empresa public.company_type;
begin
  if new.active then
    select company_type into tipo_empresa from public.companies where id = new.company_id;

    if tipo_empresa is distinct from 'transportadora' then
      if exists (
        select 1 from public.vehicles v
        where v.company_id = new.company_id
          and v.active
          and v.id <> new.id
      ) then
        raise exception 'Esta empresa já tem um veículo ativo — só empresas do tipo transportadora podem ter mais de um.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_one_vehicle_for_individual_accounts() is
  'Substitui vehicles_one_active_per_company_idx — trava 1 veículo ativo por empresa, exceto pra company_type=transportadora (V2, gestão de frota).';

create trigger enforce_one_vehicle_for_individual_accounts
  before insert or update on public.vehicles
  for each row execute function public.enforce_one_vehicle_for_individual_accounts();

-- ── drivers (motoristas) ─────────────────────────────────────────────────

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  name text not null,
  phone_e164 text,
  cnh_expiry_date date,
  toxicologico_expiry_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drivers is
  'Motorista de uma empresa transportadora (V2, gestão de frota) — registro simples, não é conta de usuário (sem auth.users/user_channels). vehicle_id é o único vínculo com veículo (protótipo auditado tinha dois campos redundantes pra isso).';

create trigger set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

alter table public.drivers enable row level security;

create policy drivers_select_member on public.drivers
  for select using (public.is_company_member(company_id));

-- ── vehicle_documents ────────────────────────────────────────────────────

create type public.vehicle_document_type as enum ('tacografo', 'rntrc', 'cnh', 'toxicologico');

create table public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete cascade,
  document_type public.vehicle_document_type not null,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_documents_exactly_one_owner check (
    (vehicle_id is not null and driver_id is null) or (vehicle_id is null and driver_id is not null)
  )
);

comment on table public.vehicle_documents is
  'Documento (tacógrafo/RNTRC do veículo, CNH/toxicológico do motorista) — V2. Nunca duplica insurance_expiry_date/licensing_expiry_date de vehicles (V1 continua usando esses campos). check garante vínculo com exatamente um de vehicle_id/driver_id (o protótipo auditado não tinha FK nenhuma).';

create trigger set_updated_at
  before update on public.vehicle_documents
  for each row execute function public.set_updated_at();

alter table public.vehicle_documents enable row level security;

create policy vehicle_documents_select_member on public.vehicle_documents
  for select using (public.is_company_member(company_id));

-- ── maintenance_schedules ────────────────────────────────────────────────

create type public.maintenance_status as enum ('pendente', 'agendado', 'concluido');

create table public.maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  type text not null,
  due_date date not null,
  status public.maintenance_status not null default 'pendente',
  alert_sent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.maintenance_schedules is
  'Manutenção programada de um veículo (V2, gestão de frota).';

create trigger set_updated_at
  before update on public.maintenance_schedules
  for each row execute function public.set_updated_at();

alter table public.maintenance_schedules enable row level security;

create policy maintenance_schedules_select_member on public.maintenance_schedules
  for select using (public.is_company_member(company_id));

-- ── checklist_dispatches ─────────────────────────────────────────────────

create type public.checklist_response_status as enum ('pendente', 'ok', 'atencao');

create table public.checklist_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  driver_id uuid not null references public.drivers (id) on delete cascade,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  response_status public.checklist_response_status not null default 'pendente',
  response_text text,
  attempt_count integer not null default 1,
  created_at timestamptz not null default now()
);

comment on table public.checklist_dispatches is
  'Um envio de checklist diário (V2) — perguntas fixas em código por enquanto (pneu/freio/luz/combustível), sem tabela de template.';

alter table public.checklist_dispatches enable row level security;

create policy checklist_dispatches_select_member on public.checklist_dispatches
  for select using (public.is_company_member(company_id));
