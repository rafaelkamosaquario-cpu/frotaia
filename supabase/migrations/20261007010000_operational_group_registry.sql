-- Registration only. No webhook activation, group replies, financial writes,
-- or connection to freight_sources. Real group identities are linked later.
begin;
create table public.operational_group_registry (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 name text not null check (length(btrim(name)) between 2 and 100),
 purpose text not null check (purpose in ('abastecimento','pesagem','lancamentos')),
 notes text not null default '' check (length(notes)<=500),
 archived boolean not null default false,
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index operational_group_registry_name on public.operational_group_registry(company_id,lower(btrim(name)));
alter table public.operational_group_registry enable row level security;
revoke all on public.operational_group_registry from anon, authenticated;
create policy operational_group_registry_read on public.operational_group_registry for select to authenticated
 using (public.has_company_role(company_id,array['owner','admin']::public.company_member_role[]));
grant select on public.operational_group_registry to authenticated;

create function public.manage_operational_groups(p_company uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; target uuid;
begin
 if auth.uid() is null or not public.has_company_role(p_company,array['owner','admin']::public.company_member_role[])
 then raise exception 'Acesso negado' using errcode='42501'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(to_jsonb(g) - 'company_id' - 'created_by' - 'updated_by' order by g.archived,g.name),'[]'::jsonb)
   into result from public.operational_group_registry g where g.company_id=p_company;
   return result;
 end if;
 target := (p_payload->>'id')::uuid;
 if p_action='save' then
   if p_payload->>'name' is null or p_payload->>'purpose' is null then raise exception 'Campos obrigatórios' using errcode='23514'; end if;
   insert into public.operational_group_registry(id,company_id,name,purpose,notes,created_by,updated_by)
   values(target,p_company,btrim(p_payload->>'name'),p_payload->>'purpose',coalesce(p_payload->>'notes',''),auth.uid(),auth.uid())
   on conflict(id) do update set name=excluded.name,purpose=excluded.purpose,notes=excluded.notes,updated_by=auth.uid(),updated_at=now()
   where operational_group_registry.company_id=p_company;
   if not found then raise exception 'Registro não autorizado' using errcode='42501'; end if;
 elsif p_action='archive' then
   if jsonb_typeof(p_payload->'archived') is distinct from 'boolean' then raise exception 'Estado inválido' using errcode='23514'; end if;
   update public.operational_group_registry set archived=(p_payload->>'archived')::boolean,updated_by=auth.uid(),updated_at=now()
   where id=target and company_id=p_company;
   if not found then raise exception 'Registro não encontrado' using errcode='42501'; end if;
 else raise exception 'Ação inválida' using errcode='23514'; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.manage_operational_groups(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_operational_groups(uuid,text,jsonb) to authenticated;
commit;
