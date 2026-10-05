begin;
-- Operational monthly totals only. Never creates or changes financial entries.
create table public.fleet_monthly_production (
 company_id uuid not null references public.companies(id),
 vehicle_id uuid not null,
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 operation text not null check(operation in ('transporte','carregamento')),
 target_tonnes numeric(12,3) check(target_tonnes > 0 and target_tonnes <= 10000000),
 actual_tonnes numeric(12,3) check(actual_tonnes >= 0 and actual_tonnes <= 10000000),
 diesel_liters numeric(12,3) check(diesel_liters >= 0 and diesel_liters <= 10000000),
 measured_through date,
 note text not null default '' check(length(note)<=1000),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key(company_id,vehicle_id,month),
 foreign key(vehicle_id,company_id) references public.vehicles(id,company_id),
 check(actual_tonnes is null or measured_through is not null),
 check(measured_through is null or to_char(measured_through,'YYYY-MM')=month)
);
create index fleet_monthly_production_month on public.fleet_monthly_production(company_id,month desc);
alter table public.fleet_monthly_production enable row level security;
revoke all on public.fleet_monthly_production from public,anon,authenticated;
grant select,insert,update on public.fleet_monthly_production to authenticated;
grant all on public.fleet_monthly_production to service_role;
create policy production_read on public.fleet_monthly_production for select to authenticated
 using(public.is_company_member(company_id));
create policy production_insert on public.fleet_monthly_production for insert to authenticated
 with check(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
create policy production_update on public.fleet_monthly_production for update to authenticated
 using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]))
 with check(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
create function public.bump_monthly_production_revision() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.company_id,new.vehicle_id,new.month) is distinct from (old.company_id,old.vehicle_id,old.month) then
  raise exception 'A identidade da apuração não pode ser alterada';
 end if;
 new.revision:=old.revision+1; new.updated_at:=now(); return new;
end; $$;
revoke all on function public.bump_monthly_production_revision() from public;
create trigger bump_monthly_production_revision before update on public.fleet_monthly_production
 for each row execute function public.bump_monthly_production_revision();
commit;
