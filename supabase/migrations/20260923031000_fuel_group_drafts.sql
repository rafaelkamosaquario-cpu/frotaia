begin;
create table public.fuel_group_drafts (
  company_id uuid not null references public.companies(id),
  group_id text not null,
  sender text not null,
  draft_id uuid not null default gen_random_uuid(),
  revision integer not null default 0,
  evidence jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(company_id,group_id,sender)
);
create table public.fuel_group_events (
  company_id uuid not null references public.companies(id),
  group_id text not null,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key(group_id,message_id)
);
alter table public.fuel_group_drafts enable row level security;
alter table public.fuel_group_events enable row level security;
-- Service-only tables: participants never query another sender's draft or any prices.
create function public.fuel_group_step(p_company uuid,p_user uuid,p_group text,p_sender text,p_message text,p_action text,p_patch jsonb,p_revision integer default null,p_draft uuid default null,p_command jsonb default null,p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  s public.fuel_group_drafts%rowtype;
  affected integer;
  new_evidence jsonb;
begin
  if not exists(select 1 from public.company_members where company_id=p_company and user_id=p_user and status::text='active' and role::text in ('owner','admin','operator')) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  if p_group is null or p_sender is null or p_message is null or length(p_message)=0 or p_action is null or p_action not in ('merge','reset','confirm') or p_dry_run is null then raise exception 'Evento inválido.'; end if;
  insert into public.fuel_group_drafts(company_id,group_id,sender) values(p_company,p_group,p_sender) on conflict do nothing;
  select * into s from public.fuel_group_drafts where company_id=p_company and group_id=p_group and sender=p_sender for update;
  insert into public.fuel_group_events(company_id,group_id,message_id) values(p_company,p_group,p_message) on conflict do nothing;
  get diagnostics affected = row_count;
  if affected=0 then return jsonb_build_object('duplicate',true); end if;
  if p_action='confirm' then
    if s.updated_at<now()-interval '2 hours' or p_revision is distinct from s.revision or p_draft is distinct from s.draft_id then raise exception 'Confirmação vencida. Solicite um novo resumo.'; end if;
    if p_command is null or p_command->>'kind'<>'withdrawal' or (p_command->>'requestId')::uuid<>s.draft_id then raise exception 'Confirmação inválida.'; end if;
    if not p_dry_run then perform public.record_fuel_stock(p_company,p_user,p_command); end if;
    update public.fuel_group_drafts set evidence='{}',revision=0,draft_id=gen_random_uuid(),updated_at=now() where company_id=p_company and group_id=p_group and sender=p_sender;
    return jsonb_build_object('confirmed',true,'dryRun',p_dry_run);
  end if;
  if p_action='reset' or s.updated_at<now()-interval '2 hours' then
    s.evidence := '{}'; s.revision:=0; s.draft_id:=gen_random_uuid();
  end if;
  new_evidence := s.evidence || jsonb_strip_nulls(coalesce(p_patch,'{}'));
  update public.fuel_group_drafts set evidence=new_evidence,revision=s.revision+1,draft_id=s.draft_id,updated_at=now() where company_id=p_company and group_id=p_group and sender=p_sender returning * into s;
  return to_jsonb(s);
end $$;
revoke all on function public.fuel_group_step(uuid,uuid,text,text,text,text,jsonb,integer,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.fuel_group_step(uuid,uuid,text,text,text,text,jsonb,integer,uuid,jsonb,boolean) to service_role;
commit;
