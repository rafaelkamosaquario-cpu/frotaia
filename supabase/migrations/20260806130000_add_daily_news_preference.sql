-- Preferência de notícias diárias do setor (opt-in — nunca manda sem o
-- cliente pedir explicitamente, mesmo princípio de allow_automatic_memory).
-- daily_news_last_sent_at evita duplicar envio no mesmo dia quando o job
-- de despacho roda mais de uma vez (retry, múltiplas execuções do cron).

alter table public.company_preferences
  add column daily_news_enabled boolean not null default false,
  add column daily_news_last_sent_at timestamptz;
