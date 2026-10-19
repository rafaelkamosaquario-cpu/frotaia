-- Additive: competence and amounts are never changed by settlement.
begin;
alter table public.expenses
  add column settlement_status text not null default 'unknown',
  add column settled_on date,
  add column settlement_version integer not null default 0,
  add column settlement_updated_by uuid,
  add column settlement_note text;
alter table public.revenues
  add column settlement_status text not null default 'unknown',
  add column settled_on date,
  add column settlement_version integer not null default 0,
  add column settlement_updated_by uuid,
  add column settlement_note text;
alter table public.expenses add constraint expenses_settlement_valid check (
  settlement_status in ('unknown','pending','settled') and (settlement_status = 'settled' or settled_on is null));
alter table public.revenues add constraint revenues_settlement_valid check (
  settlement_status in ('unknown','pending','settled') and (settlement_status = 'settled' or settled_on is null));
-- Old records remain unknown; new records start pending.
alter table public.expenses alter column settlement_status set default 'pending';
alter table public.revenues alter column settlement_status set default 'pending';
create index expenses_settlement_idx on public.expenses(company_id, settlement_status, settled_on);
create index revenues_settlement_idx on public.revenues(company_id, settlement_status, settled_on);

create table public.financial_settlement_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  record_table text not null,
  record_id uuid not null,
  old_status text,
  new_status text not null,
  old_date date,
  new_date date,
  note text,
  actor_id uuid,
  recorded_at timestamptz not null default now()
);
alter table public.financial_settlement_audit enable row level security;
revoke all on public.financial_settlement_audit from anon, authenticated;

create function public.audit_financial_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.settlement_status = 'settled' and
    (new.amount, new.company_id) is distinct from (old.amount, old.company_id) then
    raise exception 'Reabra a baixa antes de alterar o valor de um lançamento quitado';
  end if;
  if (new.settlement_status, new.settled_on, new.settlement_note)
     is distinct from (old.settlement_status, old.settled_on, old.settlement_note) then
    if new.settled_on > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'Data de baixa não pode ser futura';
    end if;
    new.settlement_version := old.settlement_version + 1;
    insert into public.financial_settlement_audit
      (company_id,record_table,record_id,old_status,new_status,old_date,new_date,note,actor_id)
    values (new.company_id,TG_TABLE_NAME,new.id,old.settlement_status,new.settlement_status,
      old.settled_on,new.settled_on,new.settlement_note,new.settlement_updated_by);
  end if;
  return new;
end $$;
revoke all on function public.audit_financial_settlement() from public;
create trigger expenses_settlement_audit before update on public.expenses
  for each row execute function public.audit_financial_settlement();
create trigger revenues_settlement_audit before update on public.revenues
  for each row execute function public.audit_financial_settlement();

-- Cost entries remain the single source of truth for remuneration payments.
-- Preserve the existing protection of confirmed payroll expenses, allowing only
-- settlement fields that exactly mirror the authoritative cost entry.
create or replace function public.protect_cost_expense() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare c public.cost_entries;
begin
  select * into c from public.cost_entries where expense_id=old.id;
  if found then
    if TG_OP='UPDATE' then
      if (to_jsonb(new)-array['settlement_status','settled_on','settlement_version','settlement_updated_by','settlement_note'])
         = (to_jsonb(old)-array['settlement_status','settled_on','settlement_version','settlement_updated_by','settlement_note'])
        and new.company_id=c.company_id
        and new.settlement_status=(case when c.paid_on is null then 'pending' else 'settled' end)
        and new.settled_on is not distinct from c.paid_on then return new;
      end if;
    end if;
    raise exception 'Despesa vinculada a Custos e remunerações: lançamento confirmado protegido.';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create function public.sync_cost_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.expense_id is not null then
    update public.expenses set
      settlement_status = case when new.paid_on is null then 'pending' else 'settled' end,
      settled_on = new.paid_on,
      settlement_note = 'Baixa vinculada a Custos e remunerações.',
      settlement_updated_by = null
    where id = new.expense_id and company_id = new.company_id;
  end if;
  return new;
end $$;
revoke all on function public.sync_cost_settlement() from public;
create trigger cost_settlement_sync after insert or update of paid_on, expense_id on public.cost_entries
  for each row execute function public.sync_cost_settlement();
update public.expenses e set
  settlement_status = case when c.paid_on is null then 'pending' else 'settled' end,
  settled_on = c.paid_on,
  settlement_note = 'Baixa vinculada a Custos e remunerações.'
from public.cost_entries c where c.expense_id=e.id and c.company_id=e.company_id;
-- Deliberately no parsing of descriptions and no global backfill of customer statements.
commit;
