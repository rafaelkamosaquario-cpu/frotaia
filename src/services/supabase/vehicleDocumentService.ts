import { vehicleDocumentCreateSchema, vehicleDocumentUpdateSchema } from "@/lib/validation/schemas";
import type { VehicleDocumentRow } from "@/lib/supabase/tables";
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
