-- Inversão do funil (09/2026): "mostrar valor antes de cadastrar". Dois
-- estados novos pro onboarding conversacional pré-pagamento — o cadastro
-- completo de 11+1 perguntas (awaiting_name...awaiting_consumption) passa
-- a rodar só depois do pagamento, não muda de estrutura.

alter type public.onboarding_state add value if not exists 'awaiting_demo_choice' after 'not_started';
alter type public.onboarding_state add value if not exists 'awaiting_demo_input' after 'awaiting_demo_choice';

comment on type public.onboarding_state is
  'awaiting_demo_choice/awaiting_demo_input: menu pequeno de demonstração pré-cadastro (frete/rota/custo), roda logo no primeiro contato, empresa já existe (mínima) nesse momento. awaiting_name...awaiting_consumption: cadastro completo de perfil, hoje disparado só depois do pagamento confirmado (ver mercadopago/webhook/route.ts) — mesma máquina de estado de sempre, só reordenada no funil.';
