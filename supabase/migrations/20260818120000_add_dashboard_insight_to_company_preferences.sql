-- "Frota IA sugere" no Dashboard do painel (V2): cache do insight gerado
-- por IA a partir dos dados já carregados na tela, pra não chamar a Claude
-- a cada carregamento de página (mesmo princípio de daily_news_last_sent_at).
alter table company_preferences
  add column dashboard_insight_text text,
  add column dashboard_insight_generated_at timestamptz;
