-- Onboarding 2 (Frota IA Gestão/Painel) — generaliza o limite de veículos
-- ativos: deixa de ser decidido por companies.company_type (rótulo
-- informado livremente pelo cliente) e passa a ser decidido pelo
-- ENTITLEMENT real da empresa (mesma fonte usada pelo gate do painel,
-- fleetPanelAccess.ts): sem Painel de Gestão = 1 veículo ativo; com
-- Painel de Gestão = até 10. Nenhuma coluna numérica nova — o limite é
-- sempre derivado na hora (ver getVehicleLimitForCompany no código, fonte
-- central única da regra, usada também pela tool gerenciar_veiculo).
--
-- Efeito colateral esperado e intencional: uma empresa hoje marcada como
-- company_type='transportadora' mas SEM entitlement de painel deixa de
-- ter veículos ilimitados e passa a ficar limitada a 1 — fecha uma
-- brecha real (o limite não deve vir de um campo que o próprio cliente
-- escolhe no onboarding).

create or replace function public.enforce_vehicle_limit_by_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  tem_painel boolean;
  limite integer;
  ativos integer;
begin
  if new.active then
    select
      coalesce(c.fleet_panel_enabled, false) or coalesce(s.fleet_panel_included, false)
    into tem_painel
    from public.companies c
    left join public.subscriptions s on s.company_id = c.id
    where c.id = new.company_id;

    limite := case when tem_painel then 10 else 1 end;

    select count(*) into ativos
    from public.vehicles v
    where v.company_id = new.company_id
      and v.active
      and v.id <> new.id;

    if ativos >= limite then
      raise exception 'Esta empresa já atingiu o limite de % veículo(s) ativo(s) do plano atual.', limite;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.enforce_vehicle_limit_by_entitlement() is
  'Limite de veículos ativos por empresa: 1 sem Painel de Gestão, 10 com Painel de Gestão (entitlement — companies.fleet_panel_enabled OR subscriptions.fleet_panel_included). Substitui enforce_one_vehicle_for_individual_accounts, que usava company_type.';

drop trigger enforce_one_vehicle_for_individual_accounts on public.vehicles;
drop function public.enforce_one_vehicle_for_individual_accounts();

create trigger enforce_vehicle_limit_by_entitlement
  before insert or update on public.vehicles
  for each row execute function public.enforce_vehicle_limit_by_entitlement();
