-- Achado da auditoria de RLS/multiempresa (docs/FROTA_IA_AUDITORIA_RLS_MULTIEMPRESA.md,
-- item 3 de "requer verificação manual"): o índice único parcial em
-- company_id previsto no plano original da unificação de identidade nunca
-- foi criado — upsertGoogleIntegrationStatus (googleIntegrationService.ts)
-- protegia "1 conexão ativa por empresa" só em nível de aplicação
-- (busca-então-atualiza-ou-insere), sem garantia do banco contra 2
-- requisições de conexão concorrentes pra mesma empresa.
create unique index if not exists google_integrations_company_active_unique
  on public.google_integrations (company_id)
  where connection_status <> 'revoked' and company_id is not null;
