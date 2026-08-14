-- Plano de unificação V1+V2, Fase 5: alertas de manutenção/documento que já
-- venceram e foram resolvidos (manutenção concluída, documento renovado)
-- viram 'resolved', distinto de 'sent' (mensagem já disparada, não
-- necessariamente resolvido) e de 'cancelled' (nunca chegou a valer).
alter type public.scheduled_alert_status add value if not exists 'resolved';
