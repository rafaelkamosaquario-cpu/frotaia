-- Histórico de documentos gerados no Painel (fechamento de coerência, 08/2026)
-- Achado real da auditoria: generated_documents só guardava metadados —
-- o PDF em si era gerado em memória, mandado por WhatsApp em base64 e
-- descartado, nunca recuperável depois. Mesmo padrão de segurança já usado
-- em vehicle-documents (bucket PRIVADO, sem policy pública — todo acesso
-- passa pelo client admin, isolamento por company_id garantido em código,
-- signed URL de curta duração gerada sob demanda). 100% aditivo.

insert into storage.buckets (id, name, public)
values ('generated-documents', 'generated-documents', false)
on conflict (id) do nothing;

alter table public.generated_documents
  add column if not exists storage_path text;

comment on column public.generated_documents.storage_path is
  'Caminho do arquivo no bucket privado generated-documents (formato: company_id/generated/document_id-arquivo.pdf). Nulo pra documentos gerados ANTES desta migration (nunca tiveram o binário persistido) — o histórico continua mostrando os metadados, só sem opção de baixar.';
