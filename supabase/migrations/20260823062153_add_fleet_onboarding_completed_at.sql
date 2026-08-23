-- Onboarding 2 (Frota IA Gestão/Painel) — coluna que distingue quem nunca
-- ativou o painel, quem está no meio da ativação e quem já concluiu.
-- Aditiva: nenhuma linha existente é apagada, nenhuma tabela é reconstruída.

alter table public.companies
  add column fleet_onboarding_completed_at timestamptz;

comment on column public.companies.fleet_onboarding_completed_at is
  'Quando o onboarding do Painel de Gestão (/frota-ativacao) foi concluído. Nulo = nunca ativou ou está no meio do fluxo — o layout de /frota redireciona pra lá. Não confundir com o entitlement (fleet_panel_enabled/subscriptions.fleet_panel_included), que é o DIREITO de acesso; esta coluna é só o ESTADO do onboarding.';

-- Backfill: quem já tem entitlement de painel hoje (antes desta migration)
-- é considerado onboarding já concluído — nunca força quem já usa o painel
-- a passar pelo wizard novo sem necessidade.
update public.companies c
set fleet_onboarding_completed_at = now()
where c.fleet_panel_enabled = true
   or exists (
     select 1 from public.subscriptions s
     where s.company_id = c.id and s.fleet_panel_included = true
   );
