-- Radar de Fretes (MVP): modo padrão de análise. AVISAR_PRIMEIRO (o padrão
-- mais econômico, decidido pelo Rafael) notifica a oportunidade e só roda a
-- análise financeira completa quando o cliente pedir; ANALISE_AUTOMATICA
-- roda tudo antes de notificar.
alter table public.company_preferences
  add column freight_radar_analysis_mode text not null default 'avisar_primeiro';

alter table public.company_preferences
  add constraint company_preferences_freight_radar_analysis_mode_check
  check (freight_radar_analysis_mode in ('avisar_primeiro', 'analise_automatica'));
