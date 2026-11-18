begin;
create table if not exists public.individual_app_legacy (
 company_id uuid primary key references public.companies(id) on delete cascade,
 granted_at timestamptz not null default now()
);
create table if not exists public.individual_app_payments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 source text not null check(source in ('manual','mercadopago')),
 reference text not null,
 amount_cents integer not null check(amount_cents=990),
 status text not null check(status in ('approved','refunded','charged_back','cancelled')),
 paid_at timestamptz not null,
 starts_at timestamptz not null,
 access_until timestamptz not null,
 actor uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(reference)
);
alter table public.individual_app_legacy enable row level security;
alter table public.individual_app_payments enable row level security;
revoke all on public.individual_app_legacy, public.individual_app_payments from anon, authenticated;
grant all on public.individual_app_legacy, public.individual_app_payments to service_role;
-- Snapshot only once: do not grandfather future purchasers on migration reruns.
create table if not exists public.individual_app_migrations (name text primary key);
alter table public.individual_app_migrations enable row level security;
revoke all on public.individual_app_migrations from anon, authenticated;
do $$
begin
 if not exists(select 1 from public.individual_app_migrations where name='legacy_20261118') then
  insert into public.individual_app_legacy(company_id)
   select company_id from public.subscriptions
   where status='ATIVA' and plan::text<>'TRIAL'
   and (valido_ate is null or valido_ate>now()) on conflict do nothing;
  insert into public.individual_app_migrations values('legacy_20261118');
 end if;
end $$;
create or replace function public.individual_app_state(p_company uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'preserved',exists(select 1 from individual_app_legacy where company_id=p_company),
  'until',(select max(access_until) from individual_app_payments where company_id=p_company and status='approved' and starts_at<=now())
 );
$$;
create or replace function public.confirm_individual_app_payment(
 p_company uuid,p_source text,p_reference text,p_amount integer,p_paid_at timestamptz,
 p_status text default 'approved',p_actor uuid default null,p_phone text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.individual_app_payments; receipt public.individual_app_payments; start_time timestamptz;
begin
 if p_company is null or p_source not in ('manual','mercadopago') or p_reference is null or p_reference !~ '^([0-9]{6,30}|E[0-9]{16}[A-Z0-9]{15})$'
 or p_amount is distinct from 990 or p_status not in ('approved','refunded','charged_back','cancelled')
 or p_paid_at is null or p_paid_at>now()+interval '5 minutes' then raise exception 'Dados do pagamento inválidos' using errcode='22023'; end if;
 if p_source='manual' then
  if p_status<>'approved' or not exists(select 1 from auth.users where id=p_actor and lower(email)='rafaelkamosaquario@gmail.com' and email_confirmed_at is not null)
   then raise exception 'Administrador não autorizado' using errcode='42501'; end if;
  if not exists(select 1 from user_channels where company_id=p_company and phone_e164=p_phone and active and channel_type='whatsapp')
   then raise exception 'Confira o vínculo do WhatsApp' using errcode='22023'; end if;
  if exists(select 1 from direct_pix_payments where reference=p_reference) then raise exception 'Transação já utilizada no plano-base' using errcode='23505'; end if;
 end if;
 -- Serialize both the receipt and the operation, including concurrent renewals.
 perform pg_advisory_xact_lock(hashtextextended('app-payment:'||p_reference,0));
 perform 1 from companies where id=p_company for update;
 if not found then raise exception 'Empresa não encontrada' using errcode='22023'; end if;
 select * into old from individual_app_payments where reference=p_reference;
 if found then
  if old.company_id<>p_company or old.amount_cents<>p_amount then raise exception 'Transação pertence a outra operação' using errcode='23505'; end if;
  if p_source='mercadopago' and p_status in ('refunded','charged_back','cancelled') then
   update individual_app_payments set status=p_status where id=old.id returning * into receipt;
   return to_jsonb(receipt);
  end if;
  return to_jsonb(old);
 end if;
 if p_status<>'approved' then return jsonb_build_object('ignored',true); end if;
 if not exists(select 1 from subscriptions where company_id=p_company and status='ATIVA' and plan::text<>'TRIAL' and (valido_ate is null or valido_ate>now()))
  then raise exception 'Ative ou renove primeiro o plano WhatsApp' using errcode='22023'; end if;
 if exists(select 1 from individual_app_legacy where company_id=p_company)
  then raise exception 'Esta operação já possui aplicativo incluído' using errcode='22023'; end if;
 select greatest(now(),coalesce(max(access_until),now())) into start_time from individual_app_payments where company_id=p_company and status='approved';
 insert into individual_app_payments(company_id,source,reference,amount_cents,status,paid_at,starts_at,access_until,actor)
 values(p_company,p_source,p_reference,p_amount,p_status,p_paid_at,start_time,start_time+interval '1 month',p_actor)
 returning * into receipt;
 return to_jsonb(receipt);
end $$;
revoke all on function public.individual_app_state(uuid) from public,anon,authenticated;
revoke all on function public.confirm_individual_app_payment(uuid,text,text,integer,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.individual_app_state(uuid) to service_role;
grant execute on function public.confirm_individual_app_payment(uuid,text,text,integer,timestamptz,text,uuid,text) to service_role;
commit;
