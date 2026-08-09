-- A migration anterior (add_fleet_panel_entitlement) tentou proteger
-- fleet_panel_enabled/is_admin com `revoke update (coluna) ... from
-- authenticated`, mas isso não teve efeito real: existe um GRANT UPDATE em
-- nível de TABELA pra authenticated (provisionamento padrão do Supabase em
-- companies/profiles), que é uma ACL independente do revoke por coluna e
-- continua permitindo update de qualquer coluna, incluindo as revogadas.
-- Confirmado via information_schema.table_privileges. Correção real:
-- revogar o UPDATE de tabela inteira e re-conceder só as colunas
-- explicitamente permitidas pro client autenticado.

revoke update on public.companies from authenticated;
grant update (
  name, trade_name, document_type, document_number, company_type,
  city, state, country_code, timezone, active,
  created_at, updated_at, created_by, updated_by
) on public.companies to authenticated;

revoke update on public.profiles from authenticated;
grant update (
  full_name, email, phone_e164, avatar_url, timezone, locale,
  onboarding_completed, created_at, updated_at
) on public.profiles to authenticated;
