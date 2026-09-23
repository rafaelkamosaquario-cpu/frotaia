-- Additive only: historical fillups are never imported into stock.
begin;
create table public.fuel_stock_balances (
  company_id uuid primary key references public.companies(id),
  liters numeric(18,3) not null default 0 check(liters >= 0),
  value numeric(18,2) not null default 0 check(value >= 0),
  last_date date,
  updated_at timestamptz not null default now()
);
create table public.fuel_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  request_id uuid not null,
  kind text not null check(kind in ('purchase','withdrawal')),
  movement_date date not null,
  invoice text,
  supplier text,
  liters numeric(18,3) not null check(liters > 0),
  amount numeric(18,2) not null check(amount > 0),
  unit_cost numeric not null check(unit_cost > 0),
  vehicle_id uuid references public.vehicles(id),
  driver_id uuid references public.drivers(id),
  meter_kind text check(meter_kind in ('km','hours')),
  meter numeric check(meter >= 0),
  fillup_id uuid unique references public.fuel_fillups(id),
  command_json jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(company_id,request_id)
);
create unique index fuel_stock_invoice_unique on public.fuel_stock_movements(company_id,lower(trim(supplier)),lower(trim(invoice))) where kind='purchase';
create index fuel_stock_history on public.fuel_stock_movements(company_id,created_at desc);
alter table public.fuel_stock_balances enable row level security;
alter table public.fuel_stock_movements enable row level security;
create policy stock_balance_read on public.fuel_stock_balances for select using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
create policy stock_movement_read on public.fuel_stock_movements for select using(public.has_company_role(company_id,array['owner','admin','operator']::public.company_member_role[]));
-- No client INSERT/UPDATE/DELETE policies. Commands go through an atomic RPC.
alter table public.fuel_fillups add column internal_stock boolean not null default false;
alter table public.fuel_fillups add column hour_meter numeric check(hour_meter is null or hour_meter >= 0);

create function public.guard_internal_fuel_insert() returns trigger language plpgsql set search_path=public as $$
begin
  if new.internal_stock and current_user not in ('postgres','service_role') then
    raise exception 'Use a movimentação de estoque para abastecimentos internos.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger guard_internal_fuel_insert before insert on public.fuel_fillups for each row execute function public.guard_internal_fuel_insert();

create function public.protect_internal_fuel() returns trigger language plpgsql set search_path=public as $$
begin
  if old.internal_stock then raise exception 'Abastecimento interno tem estoque vinculado e não pode ser editado ou excluído.'; end if;
  if TG_OP='UPDATE' and new.internal_stock then raise exception 'Não é permitido converter histórico em abastecimento interno.'; end if;
  return case when TG_OP='DELETE' then old else new end;
end $$;
create trigger protect_internal_fuel before update or delete on public.fuel_fillups for each row execute function public.protect_internal_fuel();
create function public.protect_internal_fuel_expense() returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from public.fuel_stock_movements where fillup_id=old.fuel_fillup_id) then
    raise exception 'Despesa vinculada ao estoque: alteração direta não permitida.';
  end if;
  return case when TG_OP='DELETE' then old else new end;
end $$;
create trigger protect_internal_fuel_expense before update or delete on public.expenses for each row execute function public.protect_internal_fuel_expense();

create function public.record_fuel_stock(p_company uuid,p_user uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  b public.fuel_stock_balances%rowtype;
  previous public.fuel_stock_movements%rowtype;
  result public.fuel_stock_movements%rowtype;
  kind text := p_command->>'kind';
  v_request_id uuid := (p_command->>'requestId')::uuid;
  d date := (p_command->>'date')::date;
  qty numeric := (p_command->>'liters')::numeric;
  total numeric;
  unit_price numeric;
  vehicle uuid;
  driver uuid;
  reading numeric;
  meter_type text;
  fillup uuid;
begin
  if not exists(select 1 from public.company_members where company_id=p_company and user_id=p_user and status::text='active' and role::text in ('owner','admin','operator')) then
    raise exception 'Sem permissão para movimentar estoque.' using errcode='42501';
  end if;
  if v_request_id is null or d is null or qty is null or qty<=0 or qty>100000000 or qty<>round(qty,3) or kind not in ('purchase','withdrawal') or kind is null then raise exception 'Dados inválidos.'; end if;
  if d>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data futura não permitida.'; end if;
  insert into public.fuel_stock_balances(company_id) values(p_company) on conflict do nothing;
  select * into b from public.fuel_stock_balances where company_id=p_company for update;
  select * into previous from public.fuel_stock_movements where company_id=p_company and request_id=v_request_id;
  if found then
    if previous.command_json<>p_command then raise exception 'Identificador já utilizado com outros dados.'; end if;
    return to_jsonb(previous);
  end if;
  if b.last_date is not null and d<b.last_date then raise exception 'Lance em ordem de data: já existe movimentação posterior no estoque.'; end if;
  if kind='purchase' then
    total := (p_command->>'total')::numeric;
    if total is null or total<=0 or total>100000000 or total<>round(total,2) or coalesce(length(trim(p_command->>'invoice')),0)=0 or coalesce(length(trim(p_command->>'supplier')),0)=0 then raise exception 'Informe nota, fornecedor e valor total válido.'; end if;
    unit_price := total/qty;
    update public.fuel_stock_balances set liters=liters+qty,value=value+total,last_date=d,updated_at=now() where company_id=p_company;
    -- Purchase is acquisition of inventory, not a second operating expense.
  else
    vehicle := (p_command->>'vehicleId')::uuid;
    driver := (p_command->>'driverId')::uuid;
    reading := (p_command->>'meter')::numeric;
    meter_type := p_command->>'meterKind';
    if not exists(select 1 from public.vehicles where id=vehicle and company_id=p_company) or not exists(select 1 from public.drivers where id=driver and company_id=p_company) then raise exception 'Veículo ou condutor não pertence à empresa.'; end if;
    if reading is null or reading<0 or reading>100000000 or meter_type is null or meter_type not in ('km','hours') then raise exception 'Informe quilometragem ou horímetro.'; end if;
    if qty>b.liters or b.liters=0 then raise exception 'Estoque insuficiente.'; end if;
    unit_price := b.value/b.liters;
    total := case when qty=b.liters then b.value else round(qty*unit_price,2) end;
    if total<=0 then raise exception 'Custo calculado deve ser positivo.'; end if;
    insert into public.fuel_fillups(company_id,vehicle_id,driver_id,fillup_date,liters,price_per_liter,total_amount,odometer_km,hour_meter,internal_stock,notes,created_by,updated_by)
      values(p_company,vehicle,driver,d,qty,unit_price,total,case when meter_type='km' then reading end,case when meter_type='hours' then reading end,true,'Retirada de estoque interno; custo médio na retirada.',p_user,p_user) returning id into fillup;
    insert into public.expenses(company_id,user_id,vehicle_id,expense_type,amount,expense_date,description,fuel_fillup_id)
      values(p_company,p_user,vehicle,'combustivel',total,d,'Consumo de diesel do estoque interno (não é novo pagamento)',fillup);
    update public.fuel_stock_balances set liters=liters-qty,value=value-total,last_date=d,updated_at=now() where company_id=p_company;
  end if;
  insert into public.fuel_stock_movements(company_id,request_id,kind,movement_date,invoice,supplier,liters,amount,unit_cost,vehicle_id,driver_id,meter_kind,meter,fillup_id,command_json,created_by)
    values(p_company,v_request_id,kind,d,p_command->>'invoice',p_command->>'supplier',qty,total,unit_price,vehicle,driver,meter_type,reading,fillup,p_command,p_user) returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function public.record_fuel_stock(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_fuel_stock(uuid,uuid,jsonb) to service_role;
commit;
