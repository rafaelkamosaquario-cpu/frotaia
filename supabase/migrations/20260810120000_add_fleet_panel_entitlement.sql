-- V2 (gestão de frota) — Fase 2: entitlement de acesso ao painel, separado
-- de preço/checkout (ainda não decidido). Ligado manualmente via SQL por
-- enquanto (mesmo padrão de profiles.is_admin) — quando o checkout da V2
-- existir, o webhook de pagamento passa a setar esta coluna, sem precisar
-- remodelar o gate (src/app/frota/layout.tsx). Ativar um cliente V2 de
-- verdade também costuma exigir company_type = 'transportadora' (controla
-- o trigger de múltiplos veículos ativos da Fase 1) — os dois campos são
-- independentes por design e precisam ser setados juntos manualmente.

alter table public.companies add column fleet_panel_enabled boolean not null default false;

comment on column public.companies.fleet_panel_enabled is
  'Acesso ao painel de gestão de frota (V2) liberado para esta empresa — independente de preço/checkout. Hoje só via SQL direto por quem administra o projeto (mesmo padrão de profiles.is_admin).';

-- Sem proteção de coluna, uma policy "whole row" de UPDATE (ex.:
-- companies_update_admin, que permite owner/admin editar a própria
-- empresa) deixaria qualquer owner/admin se autoconceder a V2 via chamada
-- direta ao PostgREST, ignorando completamente o app e o Zod. Revoga o
-- privilégio de UPDATE dessa coluna específica do role authenticated —
-- RLS continua valendo normalmente para as demais colunas de companies.
revoke update (fleet_panel_enabled) on public.companies from authenticated;

-- Correção retroativa do mesmo buraco em profiles.is_admin (achado ao
-- desenhar a coluna acima): profiles_update_own também é whole-row e não
-- protegia is_admin — qualquer usuário podia se autopromover a admin.
revoke update (is_admin) on public.profiles from authenticated;
