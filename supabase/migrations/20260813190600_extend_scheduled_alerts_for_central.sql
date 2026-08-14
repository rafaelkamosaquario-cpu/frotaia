-- Plano de unificação V1+V2, Fase 5: scheduled_alerts vira a fila de
-- disparo também de manutenção/documento vencendo, não só de lembrete
-- manual criado via gerenciar_alerta. maintenance_schedule_id/
-- vehicle_document_id são a origem (no máximo 1 preenchido — lembrete
-- manual continua com os 2 nulos).
alter table public.scheduled_alerts
  add column maintenance_schedule_id uuid references public.maintenance_schedules (id) on delete cascade,
  add column vehicle_document_id uuid references public.vehicle_documents (id) on delete cascade,
  add constraint scheduled_alerts_source_at_most_one check (
    (maintenance_schedule_id is not null)::int + (vehicle_document_id is not null)::int <= 1
  );

-- Idempotência do sync: no máximo 1 alerta ativo (não cancelado) por
-- manutenção/documento de origem.
create unique index if not exists scheduled_alerts_maintenance_unique_idx
  on public.scheduled_alerts (maintenance_schedule_id)
  where maintenance_schedule_id is not null and status <> 'cancelled';

create unique index if not exists scheduled_alerts_document_unique_idx
  on public.scheduled_alerts (vehicle_document_id)
  where vehicle_document_id is not null and status <> 'cancelled';
