import { vehicleDocumentCreateSchema, vehicleDocumentUpdateSchema } from "@/lib/validation/schemas";
import type { VehicleDocumentRow, VehicleDocumentTypeEnum } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export async function listVehicleDocumentsForPanel(
  client: SupabaseDbClient,
  companyId: string
): Promise<VehicleDocumentRow[]> {
  const { data, error } = await client
    .from("vehicle_documents")
    .select("*")
    .eq("company_id", companyId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

/** companyId é filtro obrigatório — usado antes de upload/download de arquivo pra nunca confiar só no id vindo da URL. */
export async function getVehicleDocument(client: SupabaseDbClient, documentId: string, companyId: string): Promise<VehicleDocumentRow | null> {
  const { data, error } = await client.from("vehicle_documents").select("*").eq("id", documentId).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createVehicleDocument(
  client: SupabaseDbClient,
  companyId: string,
  input: unknown
): Promise<VehicleDocumentRow> {
  const parsed = vehicleDocumentCreateSchema.parse(input);

  const { data, error } = await client
    .from("vehicle_documents")
    .insert({
      company_id: companyId,
      document_type: parsed.documentType,
      vehicle_id: parsed.vehicleId ?? null,
      driver_id: parsed.driverId ?? null,
      expiry_date: parsed.expiryDate,
      notes: parsed.notes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Upsert por (vehicle_id, document_type) — pra tipos de documento que
 * representam "o vencimento atual" de um veículo, sem histórico (hoje só
 * seguro/licenciamento; tacógrafo/RNTRC/CNH/toxicológico continuam
 * criados/atualizados por id via createVehicleDocument/updateVehicleDocument
 * normalmente). Depende do índice único parcial
 * `vehicle_documents_vehicle_type_unique_idx` (migration
 * 20260813190400) — só cobre document_type de veículo (driver_id nulo).
 */
export async function upsertVehicleDocumentByType(
  client: SupabaseDbClient,
  companyId: string,
  vehicleId: string,
  documentType: VehicleDocumentTypeEnum,
  expiryDate: string
): Promise<VehicleDocumentRow> {
  const { data, error } = await client
    .from("vehicle_documents")
    .upsert(
      { company_id: companyId, vehicle_id: vehicleId, driver_id: null, document_type: documentType, expiry_date: expiryDate },
      { onConflict: "vehicle_id,document_type" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateMaintenanceSchedule/updateDriver. */
export async function updateVehicleDocument(
  client: SupabaseDbClient,
  documentId: string,
  companyId: string,
  input: unknown
): Promise<VehicleDocumentRow> {
  const parsed = vehicleDocumentUpdateSchema.parse(input);

  const { data, error } = await client
    .from("vehicle_documents")
    .update({
      document_type: parsed.documentType,
      vehicle_id: parsed.vehicleId,
      driver_id: parsed.driverId,
      expiry_date: parsed.expiryDate,
      notes: parsed.notes,
    })
    .eq("id", documentId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export interface AttachDocumentFileInput {
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}

/** Grava os metadados do arquivo já enviado ao Storage — nunca chamado sem o upload ter sucesso antes. Substituir um arquivo existente sobrescreve os metadados (o path muda a cada envio, então o objeto antigo é removido separadamente pela rota). */
export async function attachDocumentFile(
  client: SupabaseDbClient,
  documentId: string,
  companyId: string,
  input: AttachDocumentFileInput
): Promise<VehicleDocumentRow> {
  const { data, error } = await client
    .from("vehicle_documents")
    .update({
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** "Remover arquivo" — limpa só os metadados do arquivo, nunca o registro do documento (tipo/dono/vencimento continuam intactos). A remoção do objeto no Storage é feita separadamente pela rota, antes de chamar isto. */
export async function removeDocumentFile(client: SupabaseDbClient, documentId: string, companyId: string): Promise<VehicleDocumentRow> {
  const { data, error } = await client
    .from("vehicle_documents")
    .update({ storage_path: null, original_filename: null, mime_type: null, file_size: null, uploaded_at: null })
    .eq("id", documentId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
