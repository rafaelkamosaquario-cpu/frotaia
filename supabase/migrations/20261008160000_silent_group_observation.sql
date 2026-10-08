begin;
create table public.operational_group_bindings (
 company_id uuid not null references public.companies(id),
 registry_id uuid primary key references public.operational_group_registry(id),
 external_id text not null unique check (external_id ~ '^[0-9]+-group$'),
 enabled boolean not null default true,
 activated_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
create table public.operational_group_observations (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 registry_id uuid not null references public.operational_group_bindings(registry_id),
 message_id text not null,
 received_at timestamptz not null default now(),
 sender_name text not null default '',
 kind text not null,
 original_text text not null default '',
 status text not null check(status in ('processing','review','unreadable')),
 summary text not null default '',
 evidence jsonb not null default '{}'::jsonb,
 unique(registry_id,message_id)
);
alter table public.operational_group_bindings enable row level security;
alter table public.operational_group_observations enable row level security;
revoke all on public.operational_group_bindings,public.operational_group_observations from anon,authenticated;
grant all on public.operational_group_bindings,public.operational_group_observations to service_role;
create index operational_group_observations_company_time on public.operational_group_observations(company_id,received_at desc);
notify pgrst,'reload schema';
commit;
