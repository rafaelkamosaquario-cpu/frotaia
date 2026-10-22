-- Private consultant inventory: separate from fleet tires and performance cases.
begin;
create table if not exists public.consultant_tire_inventory (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id),
 source_case_id uuid references public.consultant_tire_cases(id),
 version integer not null check(version>0),
 data jsonb not null check(jsonb_typeof(data)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(company_id,actor_id,source_case_id)
);
alter table public.consultant_tire_inventory enable row level security;
revoke all on public.consultant_tire_inventory from public, anon, authenticated;
grant select,insert,update on public.consultant_tire_inventory to service_role;
create table if not exists public.consultant_tire_inventory_revisions (
 inventory_id uuid not null references public.consultant_tire_inventory(id),
 version integer not null,
 data jsonb not null,
 recorded_at timestamptz not null default now(),
 primary key(inventory_id,version)
);
alter table public.consultant_tire_inventory_revisions enable row level security;
revoke all on public.consultant_tire_inventory_revisions from public,anon,authenticated;
grant select on public.consultant_tire_inventory_revisions to service_role;
create or replace function public.audit_private_tire_inventory() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='UPDATE' then
  if new.version<>old.version+1 or new.company_id<>old.company_id or new.actor_id<>old.actor_id
     or new.source_case_id is distinct from old.source_case_id then
   raise exception 'Invalid inventory revision';
  end if;
 end if;
 insert into public.consultant_tire_inventory_revisions(inventory_id,version,data) values(new.id,new.version,new.data);
 return new;
end;
$$;
revoke all on function public.audit_private_tire_inventory() from public,anon,authenticated;
create trigger private_tire_inventory_revision after insert or update on public.consultant_tire_inventory
 for each row execute function public.audit_private_tire_inventory();
commit;

