begin;
alter table public.operational_group_observations
 add column fuel_fillup_id uuid references public.fuel_fillups(id) on delete set null,
 add column revenue_id uuid references public.revenues(id) on delete set null,
 add column reviewed_at timestamptz,
 add column reviewed_by uuid references auth.users(id),
 add column review_note text,
 add constraint group_review_one_target check (fuel_fillup_id is null or revenue_id is null);
create unique index observation_one_fuel on public.operational_group_observations(fuel_fillup_id) where fuel_fillup_id is not null;
create unique index observation_one_revenue on public.operational_group_observations(revenue_id) where revenue_id is not null;

-- Links a human-checked existing record. Never inserts money, fuel or production.
create function public.link_group_observation(p_company uuid,p_actor uuid,p_observation uuid,p_type text,p_record uuid,p_note text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.operational_group_observations; target_vehicle uuid;
begin
 if not exists(select 1 from public.company_members where company_id=p_company and user_id=p_actor and status='active' and role in ('owner','admin')) then
  raise exception 'Acesso não autorizado' using errcode='42501';
 end if;
 if exists(select 1 from public.consultancy_onboardings where company_id=p_company and consultant_id=p_actor and consultant_until<=now()) then
  raise exception 'Acompanhamento encerrado' using errcode='42501';
 end if;
 if p_type is null or p_note is null or p_type not in ('fuel','revenue') or length(trim(p_note)) not between 5 and 500 then raise exception 'Revisão inválida'; end if;
 select * into o from public.operational_group_observations where id=p_observation and company_id=p_company for update;
 if not found or o.status='processing' then raise exception 'Recebimento indisponível para revisão'; end if;
 if o.fuel_fillup_id is not null or o.revenue_id is not null then
  if (p_type='fuel' and o.fuel_fillup_id=p_record) or (p_type='revenue' and o.revenue_id=p_record) then return jsonb_build_object('ok',true,'alreadyLinked',true); end if;
  raise exception 'Recebimento já vinculado a outro lançamento';
 end if;
 if p_type='fuel' then
  select vehicle_id into target_vehicle from public.fuel_fillups where id=p_record and company_id=p_company for share;
 else
  select vehicle_id into target_vehicle from public.revenues where id=p_record and company_id=p_company for share;
 end if;
 if not found or target_vehicle is null then raise exception 'Lançamento deve pertencer à empresa e identificar o veículo'; end if;
 if not exists(select 1 from public.vehicles where id=target_vehicle and company_id=p_company) then raise exception 'Veículo de outra empresa'; end if;
 update public.operational_group_observations set
  fuel_fillup_id=case when p_type='fuel' then p_record end,
  revenue_id=case when p_type='revenue' then p_record end,
  reviewed_at=now(),reviewed_by=p_actor,review_note=trim(p_note)
 where id=o.id and company_id=p_company;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.link_group_observation(uuid,uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.link_group_observation(uuid,uuid,uuid,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
