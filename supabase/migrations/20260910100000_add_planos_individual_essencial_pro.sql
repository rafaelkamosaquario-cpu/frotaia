-- Reestruturação comercial (09/2026): catálogo de planos passa de
-- "Individual vs. Gestão" para "Individual/Essencial/Pro/Empresa", com
-- Individual/Essencial/Pro oferecendo as 3 formas de cobrança (mensal
-- recorrente, anual à vista Pix, anual parcelado cartão) cada. Aditiva só —
-- Postgres não permite remover/renomear valor de enum; as chaves antigas
-- (MENSAL, GESTAO_MENSAL, ANUAL_PARCELADO, ANUAL_PIX) ficam órfãs no tipo,
-- inofensivas (tabela subscriptions está vazia, sem linha usando elas).

alter type public.subscription_plan add value if not exists 'INDIVIDUAL_MENSAL';
alter type public.subscription_plan add value if not exists 'INDIVIDUAL_ANUAL_PIX';
alter type public.subscription_plan add value if not exists 'INDIVIDUAL_ANUAL_PARCELADO';
alter type public.subscription_plan add value if not exists 'ESSENCIAL_MENSAL';
alter type public.subscription_plan add value if not exists 'ESSENCIAL_ANUAL_PIX';
alter type public.subscription_plan add value if not exists 'ESSENCIAL_ANUAL_PARCELADO';
alter type public.subscription_plan add value if not exists 'PRO_MENSAL';
alter type public.subscription_plan add value if not exists 'PRO_ANUAL_PIX';
alter type public.subscription_plan add value if not exists 'PRO_ANUAL_PARCELADO';
