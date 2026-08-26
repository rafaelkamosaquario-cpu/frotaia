import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Histórico de documentos gerados no Painel (fechamento de coerência,
 * 08/2026) — achado real da auditoria: `generated_documents` só guardava
 * metadados, o PDF em si era gerado em memória, mandado por base64 pelo
 * WhatsApp e descartado (nunca recuperável depois). Mesmo padrão de
 * segurança já usado em `vehicleDocumentsStorage.ts`: bucket PRIVADO, sem
 * policy pública — só o client admin acessa, isolamento por `companyId`
 * garantido em código (nunca por nome de arquivo), signed URL de curta
 * duração gerada sob demanda.
 */

export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNED_URL_TTL_SECONDS = 60;

export function buildGeneratedDocumentStoragePath(companyId: string, fileName: string): string {
  // Timestamp em vez de document_id no path (mesmo padrão de vehicleDocumentsStorage.ts) — evita depender do id do registro no banco, que só existe DEPOIS do INSERT.
  return `${companyId}/generated/${Date.now()}-${fileName}`;
}

export async function uploadGeneratedDocumentFile(admin: SupabaseClient, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw error;
}

export async function createSignedGeneratedDocumentUrl(admin: SupabaseClient, path: string, downloadFilename?: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(GENERATED_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, downloadFilename ? { download: downloadFilename } : undefined);
  if (error || !data) throw error ?? new Error("Não foi possível gerar o link do documento.");
  return data.signedUrl;
}
