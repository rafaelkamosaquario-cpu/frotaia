-- Correção da migration 20260813190600: o predicado `status <> 'cancelled'`
-- impediria um novo alerta 'pending' depois que o anterior já tivesse virado
-- 'sent'/'resolved' (ex.: manutenção reagendada depois do alerta antigo já
-- ter sido disparado) — só 1 alerta por origem, pra sempre. O que
-- precisamos é só "no máximo 1 PENDING por origem" (idempotência de
-- disparo); sent/resolved/failed viram histórico e podem coexistir com um
-- pending novo.
drop index if exists public.scheduled_alerts_maintenance_unique_idx;
drop index if exists public.scheduled_alerts_document_unique_idx;

create unique index scheduled_alerts_maintenance_pending_unique_idx
  on public.scheduled_alerts (maintenance_schedule_id)
  where maintenance_schedule_id is not null and status = 'pending';

create unique index scheduled_alerts_document_pending_unique_idx
  on public.scheduled_alerts (vehicle_document_id)
  where vehicle_document_id is not null and status = 'pending';
