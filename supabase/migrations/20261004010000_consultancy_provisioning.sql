begin;
-- Separate, manually granted consulting access. No subscription/payment writes.
create table public.consultancy_onboardings (
 company_id uuid primary key references public.companies(id),
 request_id uuid not null unique, consultant_id uuid not null references auth.users(id),
 client_email text not null unique check(client_email=lower(trim(client_email))),
 contact_name text not null, phone text, document text,
 client_user_id uuid unique references auth.users(id),
 initial_password_hash text, password_changed_at timestamptz, temporary_expires_at timestamptz,
 delivered_at timestamptz, claimed_at timestamptz, consultant_until timestamptz,
 created_at timestamptz not null default now()
);
alter table public.consultancy_onboardings enable row level security;
revoke all on public.consultancy_onboardings from public,anon,authenticated;
grant all on public.consultancy_onboardings to service_role;

-- Remember an actual password change, never the password. Finalization requires a fresh login after it.
create function public.consultancy_password_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update consultancy_onboardings set password_changed_at=clock_timestamp()
   where client_user_id=new.id and claimed_at is null and delivered_at is not null;
 end if;
 return new;
end; $$;
revoke all on function public.consultancy_password_changed() from public,anon,authenticated;
create trigger consultancy_password_changed after update of encrypted_password on auth.users
 for each row execute function public.consultancy_password_changed();

create function public.consultancy_membership_allowed(p_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select not exists(select 1 from consultancy_onboardings o where o.company_id=p_company
   and o.consultant_id=auth.uid() and o.consultant_until is not null and o.consultant_until<=now())
 and not exists(select 1 from consultancy_onboardings o where o.company_id=p_company and o.client_user_id=auth.uid()
   and (o.claimed_at is null or not exists(select 1 from auth.sessions s where s.user_id=auth.uid()
     and s.id::text=auth.jwt()->>'session_id')));
$$;
revoke all on function public.consultancy_membership_allowed(uuid) from public,anon;
grant execute on function public.consultancy_membership_allowed(uuid) to authenticated;

create or replace function public.is_company_member(target_company_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.consultancy_membership_allowed(target_company_id) and exists(
 select 1 from company_members where company_id=target_company_id and user_id=auth.uid() and status='active');
$$;
create or replace function public.has_company_role(target_company_id uuid,allowed_roles public.company_member_role[]) returns boolean
language sql stable security definer set search_path=public as $$
 select public.consultancy_membership_allowed(target_company_id) and exists(
 select 1 from company_members where company_id=target_company_id and user_id=auth.uid() and status='active' and role=any(allowed_roles));
$$;
-- Also cover legacy policies which inspect memberships directly. No effect on old companies.
create policy consultancy_expiry on public.company_members as restrictive to authenticated
 using(public.consultancy_membership_allowed(company_id))
 with check(public.consultancy_membership_allowed(company_id));
create policy consultancy_company_expiry on public.companies as restrictive to authenticated
 using(public.consultancy_membership_allowed(id)) with check(public.consultancy_membership_allowed(id));

create function public.consultancy_admin(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare o consultancy_onboardings%rowtype; cid uuid; uid uuid:=auth.uid();
begin
 if not exists(select 1 from auth.users where id=uid and lower(email)='rafaelkamosaquario@gmail.com' and email_confirmed_at is not null)
 then raise exception 'Somente consultor autorizado' using errcode='42501'; end if;
 if p_action='list' then
  return coalesce((select jsonb_agg(jsonb_build_object('company_id',o.company_id,'name',c.name,'client_email',o.client_email,
    'contact_name',o.contact_name,'delivered_at',o.delivered_at,'claimed_at',o.claimed_at,'consultant_until',o.consultant_until) order by o.created_at desc)
    from consultancy_onboardings o join companies c on c.id=o.company_id where o.consultant_id=uid),'[]');
 elsif p_action='create' then
  perform pg_advisory_xact_lock(hashtext(lower(trim(p_payload->>'email'))));
  select * into o from consultancy_onboardings where request_id=(p_payload->>'requestId')::uuid;
  if found then
   if o.consultant_id<>uid or o.client_email<>lower(trim(p_payload->>'email')) then raise exception 'Conflito' using errcode='23505'; end if;
   return jsonb_build_object('company_id',o.company_id);
  end if;
  if length(trim(p_payload->>'name')) not between 2 and 150 or length(trim(p_payload->>'contactName')) not between 2 and 150
     or coalesce(p_payload->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Dados inválidos' using errcode='23514'; end if;
  if exists(select 1 from auth.users where lower(email)=lower(trim(p_payload->>'email'))) then
   raise exception 'E-mail já possui conta; use o fluxo de convite existente, sem substituir senha' using errcode='23505'; end if;
  insert into companies(name,document_number,company_type,city,state,fleet_panel_enabled,fleet_onboarding_completed_at,created_by)
  values(trim(p_payload->>'name'),nullif(p_payload->>'document',''),'transportadora',nullif(p_payload->>'city',''),nullif(p_payload->>'state',''),true,now(),uid) returning id into cid;
  insert into company_members(company_id,user_id,role,status,is_default) values(cid,uid,'owner','active',false);
  insert into consultancy_onboardings(company_id,request_id,consultant_id,client_email,contact_name,phone,document)
  values(cid,(p_payload->>'requestId')::uuid,uid,lower(trim(p_payload->>'email')),trim(p_payload->>'contactName'),p_payload->>'phone',p_payload->>'document');
  insert into company_access_audit(company_id,actor_id,action,target_id) values(cid,uid,'consultancy_create',cid);
  return jsonb_build_object('company_id',cid);
 end if;
 raise exception 'Ação inválida' using errcode='23514';
end; $$;
revoke all on function public.consultancy_admin(text,jsonb) from public,anon;
grant execute on function public.consultancy_admin(text,jsonb) to authenticated;

-- Called only by trusted backend after creating a NEW Auth account, never overwrites an existing user's password.
create function public.consultancy_deliver(p_company uuid,p_actor uuid,p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare o consultancy_onboardings%rowtype; h text;
begin
 select * into o from consultancy_onboardings where company_id=p_company for update;
 if not found or o.consultant_id<>p_actor or not exists(select 1 from auth.users where id=p_actor
  and lower(email)='rafaelkamosaquario@gmail.com' and email_confirmed_at is not null)
 then raise exception 'Não autorizado' using errcode='42501'; end if;
 if o.delivered_at is not null then
  if o.client_user_id=p_user then return; end if;
  raise exception 'Acesso já entregue' using errcode='23505'; end if;
 select encrypted_password into h from auth.users where id=p_user and lower(email)=o.client_email
   and raw_app_meta_data->>'consultancy_company'=p_company::text;
 if h is null or h='' then raise exception 'Conta inválida' using errcode='23514'; end if;
 update consultancy_onboardings set client_user_id=p_user,initial_password_hash=h,temporary_expires_at=now()+interval '7 days',
   delivered_at=now(),consultant_until=now()+interval '90 days' where company_id=p_company;
 insert into company_access_audit(company_id,actor_id,action,target_id) values(p_company,p_actor,'consultancy_deliver',p_user);
end; $$;
revoke all on function public.consultancy_deliver(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.consultancy_deliver(uuid,uuid,uuid) to service_role;

create function public.consultancy_first_access(p_complete boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o consultancy_onboardings%rowtype; h text;
begin
 select * into o from consultancy_onboardings where client_user_id=auth.uid() for update;
 if not found then return jsonb_build_object('pending',false); end if;
 if not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id')
 then raise exception 'Sessão encerrada' using errcode='42501'; end if;
 if o.claimed_at is not null then return jsonb_build_object('pending',false,'company_id',o.company_id); end if;
 if o.temporary_expires_at<=now() then raise exception 'Acesso temporário expirado. Contate a consultoria.' using errcode='23514'; end if;
 if not p_complete then return jsonb_build_object('pending',true,'ready',o.password_changed_at is not null
   and exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and created_at>=o.password_changed_at)); end if;
 select encrypted_password into h from auth.users where id=auth.uid();
 if h is null or h='' or h=o.initial_password_hash or o.password_changed_at is null
 or not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id' and created_at>=o.password_changed_at)
 then raise exception 'Troque a senha e entre novamente' using errcode='23514'; end if;
 -- Ownership is granted only AFTER a real password change. Temporary sessions have NO membership.
 insert into company_members(company_id,user_id,role,status,is_default) values(o.company_id,auth.uid(),'owner','active',false);
 update company_members set role='admin' where company_id=o.company_id and user_id=o.consultant_id and role='owner';
 update consultancy_onboardings set claimed_at=now(),initial_password_hash=null where company_id=o.company_id;
 insert into company_access_audit(company_id,actor_id,action,target_id) values(o.company_id,auth.uid(),'consultancy_claim',auth.uid());
 return jsonb_build_object('pending',false,'company_id',o.company_id);
end; $$;
revoke all on function public.consultancy_first_access(boolean) from public,anon;
grant execute on function public.consultancy_first_access(boolean) to authenticated;

-- Reconcile a failed delivery without changing anyone's password or exposing Auth records.
create function public.consultancy_delivery_account(p_company uuid,p_actor uuid) returns uuid
language sql security definer set search_path=public as $$
 select u.id from consultancy_onboardings o join auth.users u on lower(u.email)=o.client_email
 where o.company_id=p_company and o.consultant_id=p_actor and o.claimed_at is null
 and u.raw_app_meta_data->>'consultancy_company'=p_company::text
 and exists(select 1 from auth.users where id=p_actor and lower(email)='rafaelkamosaquario@gmail.com' and email_confirmed_at is not null);
$$;
revoke all on function public.consultancy_delivery_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consultancy_delivery_account(uuid,uuid) to service_role;

-- Legacy policies may use a direct user_id predicate. Restrict only the newly provisioned tenants.
do $$ declare t record; begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname not in ('company_members','consultancy_onboardings')
 and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped)
 loop
  execute format('create policy consultancy_session_guard on public.%I as restrictive to authenticated using(public.consultancy_membership_allowed(company_id)) with check(public.consultancy_membership_allowed(company_id))',t.relname);
 end loop;
end $$;
-- Preserve the existing selector but exclude expired consulting grants.
create or replace function public.list_company_access() returns jsonb language plpgsql security definer set search_path=public as $$
declare mail text;
begin
 if auth.uid() is null then raise exception 'Sem sessão' using errcode='42501'; end if;
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 return jsonb_build_object(
 'companies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'role',m.role) order by c.name,c.id)
 from company_members m join companies c on c.id=m.company_id where m.user_id=auth.uid() and m.status='active'
 and public.consultancy_membership_allowed(c.id)),'[]'::jsonb),
 'invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'company_name',c.name,'role',i.role,'expires_at',i.expires_at) order by i.created_at)
 from company_access_invites i join companies c on c.id=i.company_id where i.email=mail and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()),'[]'::jsonb));
end; $$;
commit;
