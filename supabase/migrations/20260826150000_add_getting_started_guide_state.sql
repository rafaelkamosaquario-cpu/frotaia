-- Guia de Primeiros Passos (V1 WhatsApp + V2 Painel), 08/2026 — estado
-- reutiliza company_preferences (mesmo padrão já usado por
-- dashboard_insight_text/dashboard_insight_generated_at e
-- daily_news_enabled/daily_news_last_sent_at: cache/estado simples por
-- empresa, sem tabela nova). Guia ≠ onboarding — onboarding_sessions
-- continua intocada, propositalmente separada.
--
-- Texto + check (não um enum novo do Postgres) — mesmo padrão já usado
-- nesta própria tabela para campos locais como freight_radar_analysis_mode/
-- distance_unit/preferred_response_style, que também não usam enum.
alter table public.company_preferences
  add column guide_v1_status text not null default 'not_started',
  add column guide_v1_step text,
  add column guide_v1_offered_at timestamptz,
  add column guide_v2_status text not null default 'not_started',
  add column guide_v2_step text,
  add column guide_v2_offered_at timestamptz;

alter table public.company_preferences
  add constraint company_preferences_guide_v1_status_check
    check (guide_v1_status in ('not_started', 'in_progress', 'completed', 'dismissed')),
  add constraint company_preferences_guide_v2_status_check
    check (guide_v2_status in ('not_started', 'in_progress', 'completed', 'dismissed'));

comment on column public.company_preferences.guide_v1_status is
  'Estado do Guia de Primeiros Passos no WhatsApp (Individual). not_started = nunca iniciado (pode já ter sido oferecido, ver guide_v1_offered_at); in_progress = num dos 6 passos (guide_v1_step); completed = concluiu todos os passos; dismissed = escolheu "não preciso" (não oferecer automaticamente de novo, mas comando manual sempre reabre).';
comment on column public.company_preferences.guide_v1_step is
  'Passo atual do guia V1 quando guide_v1_status=in_progress: veiculo|frete|custos|registro|radar|final. Null fora de in_progress.';
comment on column public.company_preferences.guide_v1_offered_at is
  'Quando o convite inicial do guia V1 foi enviado (logo após o onboarding concluir) — garante oferta automática única. Comando manual ("tutorial"/"guia"/"primeiros passos") sempre funciona independentemente deste campo.';

comment on column public.company_preferences.guide_v2_status is
  'Estado do tour visual do Painel (Gestão) — mesma semântica de guide_v1_status.';
comment on column public.company_preferences.guide_v2_step is
  'Passo atual do tour V2 quando guide_v2_status=in_progress: dashboard|indicadores|ia_sugere|frota|operacao|radar|ia_widget|conclusao. Null fora de in_progress.';
comment on column public.company_preferences.guide_v2_offered_at is
  'Quando o convite do tour V2 foi mostrado (primeira entrada no painel após fleet_onboarding_completed_at) — garante oferta automática única.';
