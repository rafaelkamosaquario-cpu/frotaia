-- Radar de Fretes (MVP): matching de oportunidade precisa comparar
-- carroceria do veículo com a carroceria pedida na carga — hoje vehicles só
-- tem vehicle_type (categoria ampla: toco/truck/carreta etc), sem carroceria
-- específica. Campo aditivo, nullable — não quebra nenhum fluxo existente.
create type public.vehicle_body_type as enum (
  'sider',
  'graneleiro',
  'bau',
  'cacamba',
  'tanque',
  'grade_baixa',
  'prancha',
  'frigorifico',
  'outro'
);

alter table public.vehicles
  add column body_type public.vehicle_body_type;

comment on column public.vehicles.body_type is
  'Carroceria do veículo/conjunto (informada pelo cliente, nunca inferida de vehicle_type) — usada pelo Radar de Fretes para matching de compatibilidade; sem valor, matching trata como "não confirmado", nunca rejeita automaticamente.';
