-- Plano de unificação V1+V2, Fase 11: o resumo diário de notícias
-- (newsDigestService.ts) era gerado e mandado direto pelo WhatsApp, nunca
-- persistido — o painel não tinha como "visualizar notícias" sem gerar de
-- novo. Conteúdo é geral do setor, não específico de empresa (mesmo
-- princípio já documentado em /api/news/dispatch), então não é escopado
-- por company_id.
create table public.news_digests (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  generated_at timestamptz not null default now()
);

comment on table public.news_digests is
  'Histórico do resumo diário de notícias do setor — conteúdo geral, gerado 1x por execução do cron e reaproveitado por todas as empresas elegíveis (não é por empresa).';

create index news_digests_generated_at_idx on public.news_digests (generated_at desc);

alter table public.news_digests enable row level security;

-- Não é dado de empresa — qualquer usuário autenticado do produto pode ler
-- (mesmo princípio de conteúdo público/geral, sem exigir company_id).
create policy news_digests_select_authenticated on public.news_digests
  for select to authenticated using (true);

-- Sem policy de insert/update/delete: só o client admin grava, via o job
-- de disparo (/api/news/dispatch) — mesmo padrão de scheduled_alerts.
