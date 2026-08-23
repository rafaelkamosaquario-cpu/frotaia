-- Onboarding V1 (WhatsApp) — novas etapas: rota principal (condicional),
-- placa, carroceria/implemento e consumo médio do veículo.
-- Aditivo: só acrescenta valores ao enum onboarding_state, sem alterar
-- nenhuma linha existente. Nenhuma coluna nova em nenhuma tabela — placa
-- (vehicles.plate), carroceria (vehicles.body_type) e consumo
-- (vehicles.average_consumption_km_l) já existiam.
alter type public.onboarding_state add value if not exists 'awaiting_primary_route';
alter type public.onboarding_state add value if not exists 'awaiting_plate';
alter type public.onboarding_state add value if not exists 'awaiting_body_type';
alter type public.onboarding_state add value if not exists 'awaiting_consumption';
