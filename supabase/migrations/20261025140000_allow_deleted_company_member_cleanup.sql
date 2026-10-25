-- Keep the last-owner protection for existing companies. A cascading delete
-- from a company that has already been removed must be able to remove members.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.companies where id = old.company_id
  ) then
    return old;
  end if;

  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active')
    or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
      and (new.role <> 'owner' or new.status <> 'active')) then
    if (
      select count(*) from public.company_members cm
      where cm.company_id = old.company_id
        and cm.role = 'owner' and cm.status = 'active' and cm.id <> old.id
    ) = 0 then
      raise exception 'A empresa % precisa manter ao menos um owner ativo.', old.company_id;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

