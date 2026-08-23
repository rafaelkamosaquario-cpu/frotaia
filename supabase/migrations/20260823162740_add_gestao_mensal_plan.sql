-- Nova estrutura comercial (08/2026): "Frota IA Gestão Mensal" é o
-- resultado do upsell do Individual (+R$20/mês = R$99,90) — precisa de um
-- valor próprio no enum pra ser distinguível de MENSAL (Individual) e
-- carregar fleet_panel_included=true. Aditivo: nenhum valor removido,
-- nenhuma linha existente tocada. ANUAL_PARCELADO/ANUAL_PIX já existiam e
-- passam a significar sempre "Gestão anual" (reprecificados só em compras
-- novas, via catálogo em código — nenhuma linha antiga é reescrita aqui).
alter type public.subscription_plan add value if not exists 'GESTAO_MENSAL';
