-- Plano de unificação V1+V2, Fase 3: gerenciar_manutencao ganha o modo
-- CANCELAR, que precisa de um estado próprio (nunca deleta a linha).
alter type public.maintenance_status add value if not exists 'cancelado';
