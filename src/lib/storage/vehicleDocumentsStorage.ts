import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upload real de arquivo pro módulo Documentos (Rodada 1, evolução funcional
 * 08/2026) — primeiro uso de Supabase Storage no projeto. Bucket PRIVADO
 * (`vehicle-documents`, criado na migration `20260824034000`), sem policy
 * pública nenhuma: só o client admin (service role, server-only) acessa,
 * mesmo padrão de segurança já usado pra `expenses` — isolamento por
 * `company_id` garantido em código, nunca confiando em nome de arquivo.
 *
 * Path sempre `{companyId}/documents/{ownerKind}/{entityId}/{arquivo}` —
 * uma empresa nunca consegue montar o caminho de outra sem saber o
 * `companyId` real dela, e mesmo assim só o client admin (que já ignora RLS)
 * consegue ler o bucket — o isolamento real vem de nunca expor o path bruto
 * ao cliente, só URLs assinadas de curta duração (60s) geradas sob demanda.
 */

export const VEHICLE_DOCUMENTS_BUCKET = "vehicle-documents";
export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024; // 10MB — generoso pra PDF/foto de documento, sem abrir pra upload arbitrário grande
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const SIGNED_URL_TTL_SECONDS = 60;

const COMBINING_DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

function sanitizeFilename(nome: string): string {
  const semAcentoOuEspaco = nome
    .normalize("NFKD")
    .replace(COMBINING_DIACRITICS_PATTERN, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  return semAcentoOuEspaco.slice(-120) || "arquivo";
}

export function buildDocumentStoragePath(
  companyId: string,
  ownerKind: "vehicle" | "driver",
  entityId: string,
  originalFilename: string
): string {
  const nomeSeguro = sanitizeFilename(originalFilename);
  return `${companyId}/documents/${ownerKind}/${entityId}/${Date.now()}-${nomeSeguro}`;
}

export async function uploadDocumentFile(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await admin.storage.from(VEHICLE_DOCUMENTS_BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
}

export async function deleteDocumentFile(admin: SupabaseClient, path: string): Promise<void> {
  const { error } = await admin.storage.from(VEHICLE_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
}

export async function createSignedDocumentUrl(
  admin: SupabaseClient,
  path: string,
  options?: { downloadFilename?: string }
): Promise<string> {
  const { data, error } = await admin.storage
    .from(VEHICLE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options?.downloadFilename ? { download: options.downloadFilename } : undefined);
  if (error || !data) throw error ?? new Error("Não foi possível gerar o link do arquivo.");
  return data.signedUrl;
}
