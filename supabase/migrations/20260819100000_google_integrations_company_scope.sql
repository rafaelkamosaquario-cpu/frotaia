-- Unificação de identidade WhatsApp+Painel (Parte A): Google Calendar passa
-- a ser resolvido por empresa (company_id), não mais por usuário — dois
-- user_id distintos (telefone no WhatsApp, Google no painel) da mesma
-- pessoa real, uma vez na mesma empresa, devem enxergar a MESMA conexão.
--
-- A constraint física da tabela continua unique(user_id, google_account_email)
-- (não alterada aqui — trocar isso arriscaria a lógica de upsert em
-- produção sem necessidade real: a aplicação já garante "1 conexão ativa
-- por empresa" via lookup-then-update em googleIntegrationService.ts, em
-- vez de depender de constraint + ON CONFLICT).
--
-- Esta migration só amplia RLS: além do dono (user_id = auth.uid(), já
-- existente), qualquer membro ativo da empresa também pode ENXERGAR o
-- status da conexão (nunca o token — isso fica só no Vault, inacessível
-- por RLS). Toda escrita real continua exclusivamente via client admin
-- (service role, bypassa RLS) nos serviços do backend.

create policy google_integrations_select_company_member on public.google_integrations
  for select using (public.is_company_member(company_id));
