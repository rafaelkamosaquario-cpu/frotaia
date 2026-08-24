-- Manutenção: controle por km + vínculo com Despesas (Rodada 1, evolução funcional 08/2026)
-- 100% aditivo: nenhuma coluna/enum/dado existente é alterado ou removido.

alter table public.maintenance_schedules
  add column if not exists executed_date date,
  add column if not exists executed_km integer,
  add column if not exists next_due_km integer;

comment on column public.maintenance_schedules.executed_date is
  'Data em que a manutenção foi de fato realizada (pode diferir de due_date, que é a data prevista/agendada). Nulo até concluir.';
comment on column public.maintenance_schedules.executed_km is
  'Quilometragem do veículo no momento da execução — informada pelo cliente/gestor, nunca lida automaticamente (sem telemetria/odômetro monitorado neste produto).';
comment on column public.maintenance_schedules.next_due_km is
  'Quilometragem alvo da PRÓXIMA manutenção — só informativo no painel/WhatsApp; nunca gera alerta automático (não existe fonte de odômetro em tempo real pra saber quando foi atingido).';

alter table public.expenses
  add column if not exists maintenance_schedule_id uuid references public.maintenance_schedules(id) on delete set null;

comment on column public.expenses.maintenance_schedule_id is
  'Vincula a despesa à manutenção que a originou (custo informado ao concluir uma manutenção). Nulo para despesas sem origem em manutenção. No máximo 1 despesa por manutenção (índice único parcial abaixo) — garante que editar o custo de uma manutenção já vinculada atualiza a despesa existente em vez de criar outra.';

create unique index if not exists expenses_maintenance_schedule_unique_idx
  on public.expenses (maintenance_schedule_id)
  where maintenance_schedule_id is not null;
