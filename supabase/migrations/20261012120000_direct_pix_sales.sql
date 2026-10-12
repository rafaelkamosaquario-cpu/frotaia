-- Additive migration. Does not modify Mercado Pago routes or existing grants.
begin;
create table public.direct_pix_payments (
 id uuid primary key, company_id uuid not null references public.companies(id),
 actor_id uuid not null references auth.users(id), customer_user_id uuid not null references auth.users(id),
 phone text not null, plan public.subscription_plan not null, reference text not null unique,
 amount_cents integer not null check(amount_cents > 0), paid_at timestamptz not null,
 access_from timestamptz not null, access_until timestamptz not null,
 previous_subscription jsonb, created_at timestamptz not null default now()
);
alter table public.direct_pix_payments enable row level security;
revoke all on public.direct_pix_payments from anon, authenticated;
grant select, insert on public.direct_pix_payments to service_role;

create function public.confirm_direct_pix(p_actor uuid, p_id uuid, p_company uuid, p_phone text,
 p_plan text, p_reference text, p_amount integer, p_paid_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
 old public.subscriptions%rowtype; receipt public.direct_pix_payments%rowtype;
 customer uuid; expected integer; vehicle_limit integer; panel boolean;
 starts timestamptz; ends timestamptz; manual_override boolean;
begin
 if not exists(select 1 from auth.users where id=p_actor and lower(email)='rafaelkamosaquario@gmail.com' and email_confirmed_at is not null) then
  raise exception 'Administrador não autorizado.' using errcode='42501'; end if;
 if p_id is null or p_company is null or p_phone is null or p_phone !~ '^\+55[1-9][0-9]{9,10}$'
 or p_reference is null or p_reference !~ '^[0-9]{6,30}$' or p_paid_at is null or p_paid_at>now() then
  raise exception 'Confira telefone, referência e data.' using errcode='22023'; end if;
 -- Shared reference lock + company lock serialize duplicate requests and renewals.
 perform pg_advisory_xact_lock(hashtextextended('direct-pix:'||p_reference,0));
 select * into receipt from public.direct_pix_payments where id=p_id or reference=p_reference;
 if found then
  if receipt.company_id is distinct from p_company or receipt.phone is distinct from p_phone or receipt.plan::text is distinct from p_plan
   or receipt.amount_cents is distinct from p_amount or receipt.paid_at is distinct from p_paid_at or receipt.reference is distinct from p_reference then
   raise exception 'Pagamento já registrado com outros dados.' using errcode='23505'; end if;
  return to_jsonb(receipt); end if;
 select fleet_panel_enabled into manual_override from public.companies where id=p_company for update;
 if not found then raise exception 'Empresa não encontrada.' using errcode='22023'; end if;
 if manual_override then raise exception 'Empresa possui liberação especial de consultoria. Reconcilie antes de vender um plano.' using errcode='22023'; end if;
 select uc.user_id into customer from public.user_channels uc
  join public.company_members m on m.company_id=uc.company_id and m.user_id=uc.user_id
  where uc.company_id=p_company and uc.phone_e164=p_phone and uc.active and uc.channel_type::text='whatsapp'
  and m.status::text='active' and m.role::text='owner' limit 1;
 if customer is null then raise exception 'WhatsApp sem vínculo de proprietário nesta empresa. Inicie a conversa no Frota IA primeiro.' using errcode='22023'; end if;
 if exists(select 1 from public.subscriptions where mercadopago_payment_id=p_reference)
 or exists(select 1 from public.payment_events where mercadopago_payment_id=p_reference) then
  raise exception 'Esta referência já passou pelo checkout. Reconcilie o pagamento, sem nova liberação.' using errcode='23505'; end if;
 expected := case p_plan when 'INDIVIDUAL_MENSAL' then 8990 when 'INDIVIDUAL_ANUAL_PIX' then 89900
 when 'ESSENCIAL_MENSAL' then 14990 when 'ESSENCIAL_ANUAL_PIX' then 149900
 when 'PRO_MENSAL' then 24990 when 'PRO_ANUAL_PIX' then 249900 else null end;
 if expected is null or p_amount is distinct from expected then raise exception 'Plano ou valor inválido.' using errcode='22023'; end if;
 vehicle_limit := case when p_plan like 'INDIVIDUAL_%' then 1 when p_plan like 'ESSENCIAL_%' then 3 else 10 end;
 panel := vehicle_limit>1;
 if (select count(*) from public.vehicles where company_id=p_company and active)>vehicle_limit then
  raise exception 'Quantidade de veículos excede o plano.' using errcode='22023'; end if;
 select * into old from public.subscriptions where company_id=p_company for update;
 if old.mercadopago_subscription_id is not null or old.mercadopago_payment_id is not null then
  raise exception 'Existe vínculo com checkout Mercado Pago. Reconcilie a assinatura antes de liberar manualmente.' using errcode='22023'; end if;
 starts := now();
 if old.status::text='ATIVA' and (old.valido_ate is null or old.valido_ate>now()) then
  if old.valido_ate is null or old.plan::text<>p_plan or not exists(select 1 from public.direct_pix_payments where company_id=p_company) then
   raise exception 'Assinatura ativa incompatível. Não foi sobrescrita.' using errcode='22023'; end if;
  starts := old.valido_ate;
 end if;
 ends := case when p_plan like '%ANUAL%' then starts+interval '365 days' else
  ((starts at time zone 'UTC')+interval '1 month') at time zone 'UTC' end;
 insert into public.direct_pix_payments(id,company_id,actor_id,customer_user_id,phone,plan,reference,amount_cents,paid_at,access_from,access_until,previous_subscription)
 values(p_id,p_company,p_actor,customer,p_phone,p_plan::public.subscription_plan,p_reference,p_amount,p_paid_at,starts,ends,to_jsonb(old)) returning * into receipt;
 insert into public.subscriptions(company_id,plan,status,valor_centavos,iniciado_em,valido_ate,fleet_panel_included)
 values(p_company,p_plan::public.subscription_plan,'ATIVA',p_amount,now(),ends,panel)
 on conflict(company_id) do update set plan=excluded.plan,status=excluded.status,valor_centavos=excluded.valor_centavos,
 iniciado_em=excluded.iniciado_em,valido_ate=excluded.valido_ate,fleet_panel_included=excluded.fleet_panel_included;
 -- Resume demo into full onboarding, without resetting in-progress/completed registrations.
 update public.onboarding_sessions set state='awaiting_name' where user_id=customer
 and state::text in ('awaiting_demo_input','awaiting_demo_choice','awaiting_payment','awaiting_plan_choice');
 -- Prevent the legacy completion CTA from asking this paid customer to pay again.
 update public.onboarding_sessions set collected_data=coalesce(collected_data,'{}'::jsonb)-'ofertaPretendida'-'awaitingPlanChoice' where user_id=customer;
 return to_jsonb(receipt);
end $$;
revoke all on function public.confirm_direct_pix(uuid,uuid,uuid,text,text,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_direct_pix(uuid,uuid,uuid,text,text,text,integer,timestamptz) to service_role;
commit;
