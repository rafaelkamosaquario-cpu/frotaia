-- Plano de unificação V1+V2, Fase 4: resolve a duplicidade real entre
-- vehicles.insurance_expiry_date/licensing_expiry_date (escritas só pelo
-- WhatsApp) e vehicle_documents (escrita só pelo painel) — os dois viram
-- linhas de vehicle_documents a partir de agora. ALTER TYPE ADD VALUE
-- precisa estar em migration própria, nunca na mesma transação que usa o
-- valor novo (índice/backfill ficam nas migrations seguintes).
alter type public.vehicle_document_type add value if not exists 'seguro';
alter type public.vehicle_document_type add value if not exists 'licenciamento';
