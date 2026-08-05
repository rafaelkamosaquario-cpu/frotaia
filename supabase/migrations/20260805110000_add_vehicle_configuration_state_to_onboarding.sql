-- Camada 7 — nova etapa obrigatória do onboarding: configuração do veículo
-- (vehicle_type + axle_count), classificada por
-- src/ai/whatsapp/vehicleConfigClassifier.ts a partir da resposta livre do
-- motorista. Substitui a antiga pergunta "quantos veículos" (produto só
-- permite 1 veículo ativo por conta — vehicles_one_active_per_company_idx).

alter type public.onboarding_state add value 'awaiting_vehicle_configuration' after 'awaiting_primary_vehicle';

comment on type public.onboarding_state is
  'awaiting_vehicle_count ficou sem uso a partir da Camada 7 (produto so permite 1 veiculo por conta) - mantido no enum para nao quebrar historico, nunca mais atribuido pelo codigo.';
