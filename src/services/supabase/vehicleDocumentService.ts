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
