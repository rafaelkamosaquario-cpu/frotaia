-- Additive only: no modification/deletion of customer vehicles, drivers or expenses.
begin;
create table public.cost_operations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 name text not null check(length(trim(name)) between 2 and 80), created_at timestamptz not null default now()
);
create unique index cost_operations_name on public.cost_operations(company_id, lower(trim(name)));
create table public.cost_rules (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 definition jsonb not null check(jsonb_typeof(definition) = 'object'), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.cost_entries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 rule_id uuid not null references public.cost_rules(id), month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 snapshot jsonb not null, amount numeric(14,2) not null check(amount > 0), due_date date not null,
 expense_id uuid unique references public.expenses(id) on delete restrict,
 paid_on date, created_at timestamptz not null default now(), unique(rule_id,month),
 check(paid_on is null or expense_id is not null)
);
create index cost_rules_company on public.cost_rules(company_id);
create index cost_entries_company_month on public.cost_entries(company_id,month);
alter table public.cost_operations enable row level security;
alter table public.cost_rules enable row level security;
alter table public.cost_entries enable row level security;
create policy cost_operations_read on public.cost_operations for select to authenticated using (
 exists(select 1 from public.company_members m where m.company_id = cost_operations.company_id and m.user_id = auth.uid() and m.role::text in ('owner','admin','operator')));
create policy cost_rules_read on public.cost_rules for select to authenticated using (
 exists(select 1 from public.company_members m where m.company_id = cost_rules.company_id and m.user_id = auth.uid() and m.role::text in ('owner','admin','operator')));
create policy cost_entries_read on public.cost_entries for select to authenticated using (
 exists(select 1 from public.company_members m where m.company_id = cost_entries.company_id and m.user_id = auth.uid() and m.role::text in ('owner','admin','operator')));
grant select on public.cost_operations, public.cost_rules, public.cost_entries to authenticated;
grant all on public.cost_operations, public.cost_rules, public.cost_entries to service_role;

-- The expense and its link are committed together; row lock prevents duplicate clicks.
create function public.confirm_cost_entry(p_company uuid, p_user uuid, p_entry uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.cost_entries; expense uuid; vehicle uuid;
begin
 if not exists(select 1 from company_members where company_id=p_company and user_id=p_user and role::text in ('owner','admin','operator')) then raise exception 'Sem permissão'; end if;
 select * into e from cost_entries where id=p_entry and company_id=p_company for update;
 if not found then raise exception 'Lançamento não encontrado'; end if;
 if e.expense_id is not null then return e.expense_id; end if;
 vehicle := nullif(e.snapshot->>'vehicleId','')::uuid;
 if vehicle is not null and not exists(select 1 from vehicles where id=vehicle and company_id=p_company) then raise exception 'Veículo inválido'; end if;
 insert into expenses(company_id,user_id,vehicle_id,expense_type,amount,expense_date,vendor,description)
 values(p_company,p_user,vehicle,'outro',e.amount,(e.month||'-01')::date,
 nullif(e.snapshot->>'person',''), 'Custos e remunerações — '||(e.snapshot->>'name')||' — competência '||e.month)
 returning id into expense;
 update cost_entries set expense_id=expense where id=e.id;
 return expense;
end $$;
revoke all on function public.confirm_cost_entry(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirm_cost_entry(uuid,uuid,uuid) to service_role;

-- Confirmed snapshots must not be silently changed from the old expense editor.
create function public.protect_cost_expense() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
 if exists(select 1 from cost_entries where expense_id=old.id) then
   raise exception 'Despesa vinculada a Custos e remunerações: lançamento confirmado protegido.';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_cost_expense before update or delete on public.expenses for each row execute function public.protect_cost_expense();
commit;
