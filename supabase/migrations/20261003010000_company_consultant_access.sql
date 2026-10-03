begin;
create table public.company_access_invites (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 email text not null check(email=lower(trim(email)) and length(email) between 3 and 254 and position('@' in email)>1),
 role public.company_member_role not null check(role in ('admin','operator','viewer')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references auth.users(id), accepted_at timestamptz, revoked_at timestamptz
);
create unique index company_pending_email on public.company_access_invites(company_id,email) where accepted_at is null and revoked_at is null;
create table public.company_access_audit (
 id bigint generated always as identity primary key, company_id uuid not null references public.companies(id),
 actor_id uuid not null, action text not null, target_id uuid not null,
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
alter table public.company_access_invites enable row level security;
alter table public.company_access_audit enable row level security;
create policy access_audit_owner on public.company_access_audit for select to authenticated using(public.has_company_role(company_id,array['owner']::public.company_member_role[]));
revoke all on public.company_access_invites,public.company_access_audit from anon,authenticated;
grant select on public.company_access_audit to authenticated;
-- Prevent bypassing the invitation path or self-promotion using the old admin policy.
-- Existing backend bootstrap/account-link flows use service_role and remain intact.
revoke insert,update,delete on public.company_members from authenticated,anon;
-- Revoked consultants must also lose cost read access (legacy policies omitted status).
drop policy cost_operations_read on public.cost_operations;
create policy cost_operations_read on public.cost_operations for select to authenticated using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
drop policy cost_rules_read on public.cost_rules;
create policy cost_rules_read on public.cost_rules for select to authenticated using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
drop policy cost_entries_read on public.cost_entries;
create policy cost_entries_read on public.cost_entries for select to authenticated using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));

create function public.list_company_access() returns jsonb language plpgsql security definer set search_path=public as $$
declare mail text;
begin
 if auth.uid() is null then raise exception 'Sem sessão' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 return jsonb_build_object(
  'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',m.role) order by c.name,c.id) from public.company_members m join public.companies c on c.id=m.company_id where m.user_id=auth.uid() and m.status='active'),'[]'::jsonb),
  'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'company_name',c.name,'role',i.role,'expires_at',i.expires_at) order by i.created_at) from public.company_access_invites i join public.companies c on c.id=i.company_id where i.email=mail and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb));
end; $$;

create function public.manage_company_access(p_company uuid,p_action text,p_id uuid default null,p_email text default null,p_role public.company_member_role default 'admin') returns jsonb
language plpgsql security definer set search_path=public as $$
declare i public.company_access_invites%rowtype; m public.company_members%rowtype; previous jsonb; result jsonb;
begin
 if auth.uid() is null or not public.has_company_role(p_company,array['owner']::public.company_member_role[]) then raise exception 'Somente o proprietário gerencia acessos' using errcode='42501'; end if;
 -- Serialize management/acceptance for this tenant.
 perform id from public.companies where id=p_company for update;
 if p_action='list' then
  return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('id',cm.id,'user_id',cm.user_id,'email',u.email,'role',cm.role,'status',cm.status) order by cm.created_at) from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company),'[]'::jsonb),
   'invites',coalesce((select jsonb_agg(to_jsonb(ci) order by ci.created_at desc) from public.company_access_invites ci where ci.company_id=p_company and ci.accepted_at is null and ci.revoked_at is null),'[]'::jsonb));
 elsif p_action='invite' then
  if p_email is null or length(trim(p_email)) not between 3 and 254 or position('@' in p_email)<2 or p_role not in ('admin','operator','viewer') or p_role is null then raise exception 'Convite inválido' using errcode='23514'; end if;
  if exists(select 1 from public.company_members cm join auth.users u on u.id=cm.user_id where cm.company_id=p_company and cm.status='active' and lower(u.email)=lower(trim(p_email))) then raise exception 'Usuário já possui acesso' using errcode='23505'; end if;
  insert into public.company_access_invites(company_id,email,role,created_by) values(p_company,lower(trim(p_email)),p_role,auth.uid()) returning * into i;
  result:=to_jsonb(i); p_id:=i.id;
 elsif p_action='revoke_invite' then
  select * into i from public.company_access_invites where id=p_id and company_id=p_company for update;
  if not found or i.accepted_at is not null or i.revoked_at is not null then raise exception 'Convite alterado; atualize' using errcode='23505'; end if;
  previous:=to_jsonb(i);
  update public.company_access_invites set revoked_at=now() where id=p_id returning to_jsonb(company_access_invites.*) into result;
 elsif p_action='revoke_member' then
  select * into m from public.company_members where id=p_id and company_id=p_company for update;
  if not found or m.status<>'active' then raise exception 'Acesso alterado; atualize' using errcode='23505'; end if;
  if m.role='owner' or m.user_id=auth.uid() then raise exception 'Proprietário não pode ser removido por este fluxo' using errcode='23514'; end if;
  previous:=to_jsonb(m);
  update public.company_members set status='removed',is_default=false where id=p_id returning to_jsonb(company_members.*) into result;
 else raise exception 'Ação inválida' using errcode='23514'; end if;
 insert into public.company_access_audit(company_id,actor_id,action,target_id,before_state,after_state) values(p_company,auth.uid(),p_action,p_id,previous,result);
 return result;
end; $$;

create function public.accept_company_access(p_invite uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare i public.company_access_invites%rowtype; mail text; m public.company_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Sem sessão' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from public.company_access_invites where id=p_invite and email=mail;
 if not found then raise exception 'Convite indisponível para esta conta Google' using errcode='42501'; end if;
 perform id from public.companies where id=i.company_id for update;
 select * into i from public.company_access_invites where id=p_invite for update;
 if i.accepted_by=auth.uid() and i.accepted_at is not null then
  if public.is_company_member(i.company_id) then return i.company_id; end if;
  raise exception 'Acesso revogado; solicite novo convite' using errcode='42501';
 end if;
 if i.revoked_at is not null or i.expires_at<=now() or i.accepted_at is not null then raise exception 'Convite expirado ou revogado' using errcode='23514'; end if;
 -- Never elevate or downgrade an already-active membership through an old invitation.
 select * into m from public.company_members where company_id=i.company_id and user_id=auth.uid() for update;
 if found and m.status='active' then raise exception 'Usuário já possui acesso; atualize' using errcode='23505'; end if;
 insert into public.company_members(company_id,user_id,role,status,is_default) values(i.company_id,auth.uid(),i.role,'active',false)
 on conflict(company_id,user_id) do update set role=excluded.role,status='active',is_default=false returning * into m;
 update public.company_access_invites set accepted_at=now(),accepted_by=auth.uid() where id=p_invite;
 insert into public.company_access_audit(company_id,actor_id,action,target_id,after_state) values(i.company_id,auth.uid(),'accept',p_invite,to_jsonb(m));
 return i.company_id;
end; $$;
revoke all on function public.list_company_access(),public.manage_company_access(uuid,text,uuid,text,public.company_member_role),public.accept_company_access(uuid) from public,anon;
grant execute on function public.list_company_access(),public.manage_company_access(uuid,text,uuid,text,public.company_member_role),public.accept_company_access(uuid) to authenticated;
commit;
