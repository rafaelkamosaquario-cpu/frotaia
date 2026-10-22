-- Preparation only: no driver session, checklist, fuel or accounting writes.
begin;
create table public.fleet_nfc_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  vehicle_id uuid references public.vehicles(id),
  kind text not null check (kind in ('vehicle','pump')),
  label text not null check (length(label) between 2 and 100),
  physical_code text not null default '' check (length(physical_code) <= 100),
  token text not null unique check (token ~ '^[a-f0-9]{48}$'),
  status text not null default 'pending' check (status in ('pending','tested','revoked')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'vehicle' and vehicle_id is not null) or (kind = 'pump' and vehicle_id is null))
);
create unique index fleet_nfc_vehicle_current on public.fleet_nfc_tags(vehicle_id) where status <> 'revoked';
create unique index fleet_nfc_physical_current on public.fleet_nfc_tags(company_id, physical_code) where status <> 'revoked' and physical_code <> '';
alter table public.fleet_nfc_tags enable row level security;
revoke all on public.fleet_nfc_tags from anon, authenticated;
grant select, insert, update on public.fleet_nfc_tags to service_role;
create function public.validate_fleet_nfc_tag() returns trigger language plpgsql set search_path = public as $$
begin
  if new.vehicle_id is not null and not exists (select 1 from public.vehicles where id = new.vehicle_id and company_id = new.company_id) then
    raise exception 'Vehicle/company mismatch';
  end if;
  if TG_OP = 'UPDATE' then
    if (new.company_id,new.vehicle_id,new.kind,new.token,new.created_by,new.created_at,new.label,new.physical_code) is distinct from
       (old.company_id,old.vehicle_id,old.kind,old.token,old.created_by,old.created_at,old.label,old.physical_code) then
      raise exception 'Tag identity is immutable; revoke and create another tag';
    end if;
    if old.status = 'revoked' or new.version <> old.version + 1 or not
      (new.status = 'revoked' or (old.status = 'pending' and new.status = 'tested')) then
      raise exception 'Invalid tag transition';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_fleet_nfc_tag before insert or update on public.fleet_nfc_tags for each row execute function public.validate_fleet_nfc_tag();
commit;
