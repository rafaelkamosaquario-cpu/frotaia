-- Reestruturação comercial Individual/Essencial/Pro (09/2026): o limite de
-- veículos ativos deixou de ser binário (1 sem Painel / 10 com Painel) —
-- Essencial tem até 3. O trigger `enforce_vehicle_limit_by_entitlement`
-- (última linha de defesa, mesma regra de src/lib/frota/vehicleLimit.ts)
-- precisa refletir isso, senão uma empresa Essencial conseguiria cadastrar
-- até 10 veículos direto no banco se algum caminho de escrita esquecer de
-- checar o limite na aplicação.

create or replace function public.enforce_vehicle_limit_by_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  painel_manual boolean;
  plano_atual public.subscription_plan;
  painel_assinatura boolean;
  limite integer;
  ativos integer;
begin
  if new.active then
    select coalesce(c.fleet_panel_enabled, false)
    into painel_manual
    from public.companies c
    where c.id = new.company_id;

    select s.plan, coalesce(s.fleet_panel_included, false)
    into plano_atual, painel_assinatura
    from public.subscriptions s
    where s.company_id = new.company_id;

    limite := case
      when painel_manual then 10 -- override manual/administrativo sempre libera o teto mais alto
      when plano_atual in ('INDIVIDUAL_MENSAL', 'INDIVIDUAL_ANUAL_PIX', 'INDIVIDUAL_ANUAL_PARCELADO') then 1
      when plano_atual in ('ESSENCIAL_MENSAL', 'ESSENCIAL_ANUAL_PIX', 'ESSENCIAL_ANUAL_PARCELADO') then 3
      when plano_atual in ('PRO_MENSAL', 'PRO_ANUAL_PIX', 'PRO_ANUAL_PARCELADO') then 10
      when coalesce(painel_assinatura, false) then 10 -- fallback pras chaves antigas (MENSAL/GESTAO_MENSAL/ANUAL_*) e TRIAL/EMPRESA
      else 1
    end;

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
  'Limite de veículos ativos por empresa: 1 (Individual/sem Painel), 3 (Essencial), 10 (Pro/override manual). Deriva de subscriptions.plan (estrutura Individual/Essencial/Pro, 09/2026); fallback binário pras chaves antigas.';
