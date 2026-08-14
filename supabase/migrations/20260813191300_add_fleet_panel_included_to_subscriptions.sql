-- Plano de unificação V1+V2, Fase 15: entitlement do painel V2 sai do
-- boolean solto (companies.fleet_panel_enabled, 100% manual, desacoplado
-- de cobrança) e ganha uma dimensão real dentro de subscriptions — aditivo,
-- não remove/altera nada do fluxo de pagamento da V1 já em produção.
-- Preço/plano da V2 continuam não definidos aqui (fora do escopo desta
-- fase) — este campo só é setado manualmente por enquanto, mesmo padrão de
-- fleet_panel_enabled, até existir checkout real da V2.
alter table public.subscriptions add column fleet_panel_included boolean not null default false;

comment on column public.subscriptions.fleet_panel_included is
  'Se o plano desta assinatura inclui o painel de gestão de frota (V2) — independente de cadência de cobrança (plan). Hoje setado manualmente; quando existir checkout da V2, o webhook do Mercado Pago passa a setar conforme o produto comprado.';
