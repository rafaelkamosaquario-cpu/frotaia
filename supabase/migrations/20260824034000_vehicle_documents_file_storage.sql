-- Documentos: upload real de arquivo (Rodada 1, evolução funcional 08/2026)
-- Primeiro uso de Supabase Storage no projeto (antes só PDF/imagem base64 direto por
-- WhatsApp — ver comentário histórico em generated_documents). Bucket PRIVADO, sem
-- policy pública nenhuma: todo acesso passa pelo client admin (server-only), mesmo
-- padrão de segurança já usado em `expenses` (isolamento por company_id garantido em
-- código, não por RLS de sessão de navegador) — nenhuma policy de storage.objects é
-- necessária porque nenhum client de sessão/browser toca o bucket diretamente.
-- 100% aditivo: nenhuma coluna/dado existente é alterado ou removido.

insert into storage.buckets (id, name, public)
values ('vehicle-documents', 'vehicle-documents', false)
on conflict (id) do nothing;

alter table public.vehicle_documents
  add column if not exists storage_path text,
  add column if not exists original_filename text,
  add column if not exists mime_type text,
  add column if not exists file_size integer,
  add column if not exists uploaded_at timestamptz;

comment on column public.vehicle_documents.storage_path is
  'Caminho do arquivo no bucket privado vehicle-documents (formato: company_id/documents/vehicle|driver/entity_id/arquivo). Nulo quando o documento não tem arquivo anexado (compatibilidade com documentos antigos, que continuam válidos só com os metadados).';
comment on column public.vehicle_documents.original_filename is 'Nome original do arquivo enviado, só para exibição/download — nunca usado como parte do caminho de storage por segurança.';
comment on column public.vehicle_documents.mime_type is 'Tipo MIME do arquivo (application/pdf, image/jpeg, image/png) — valida o que pode ser baixado/visualizado.';
comment on column public.vehicle_documents.file_size is 'Tamanho do arquivo em bytes, só informativo.';
comment on column public.vehicle_documents.uploaded_at is 'Quando o arquivo atual foi enviado — nulo se nunca houve upload, atualizado a cada substituição.';
