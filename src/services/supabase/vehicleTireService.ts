import { vehicleTireCreateSchema, vehicleTireUpdateSchema } from "@/lib/validation/schemas";
import type { VehicleTireRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export interface ListVehicleTiresFilter {
  companyId: string;
  vehicleId?: string;
  status?: VehicleTireRow["status"];
}

export async function listVehicleTires(client: SupabaseDbClient, filter: ListVehicleTiresFilter): Promise<VehicleTireRow[]> {
  let query = client.from("vehicle_tires").select("*").eq("company_id", filter.companyId).order("created_at", { ascending: false });

  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.status) query = query.eq("status", filter.status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getVehicleTire(client: SupabaseDbClient, tireId: string): Promise<VehicleTireRow | null> {
  const { data, error } = await client.from("vehicle_tires").select("*").eq("id", tireId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createVehicleTire(client: SupabaseDbClient, companyId: string, userId: string, input: unknown): Promise<VehicleTireRow> {
  const parsed = vehicleTireCreateSchema.parse(input);

  const { data, error } = await client
    .from("vehicle_tires")
    .insert({
      company_id: companyId,
      vehicle_id: parsed.vehicleId,
      tire_profile_id: parsed.tireProfileId,
      position: parsed.position,
      brand: parsed.brand,
      model: parsed.model,
      status: parsed.status,
      mounted_at: parsed.mountedAt,
      mounted_km: parsed.mountedKm,
      last_checked_km: parsed.lastCheckedKm,
      expected_life_km: parsed.expectedLifeKm,
      notes: parsed.notes,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** `companyId` sempre exigido no filtro — mesmo princípio de vendorService/fuelFillupService: nunca confiar só num id vindo do modelo. */
export async function updateVehicleTire(
  client: SupabaseDbClient,
  tireId: string,
  companyId: string,
  userId: string,
  input: unknown
): Promise<VehicleTireRow> {
  const parsed = vehicleTireUpdateSchema.parse(input);

  const { data, error } = await client
    .from("vehicle_tires")
    .update({
      vehicle_id: parsed.vehicleId,
      tire_profile_id: parsed.tireProfileId,
      position: parsed.position,
      brand: parsed.brand,
      model: parsed.model,
      status: parsed.status,
      mounted_at: parsed.mountedAt,
      mounted_km: parsed.mountedKm,
      last_checked_km: parsed.lastCheckedKm,
      expected_life_km: parsed.expectedLifeKm,
      removed_at: parsed.removedAt,
      removal_reason: parsed.removalReason,
      notes: parsed.notes,
      updated_by: userId,
    })
    .eq("id", tireId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export interface TireKmComputed {
  /** Nulo quando falta mounted_km ou last_checked_km — nunca estimado. */
  kmRodado: number | null;
  /** Nulo quando falta expected_life_km ou kmRodado — nunca estimado. */
  kmRestante: number | null;
}

/**
 * Km rodado/restante são SEMPRE calculados na leitura, nunca guardados —
 * evita ficar inconsistente se mounted_km/last_checked_km/expected_life_km
 * forem editados depois. kmRodado negativo (leitura mais antiga que a
 * montagem, dado incoerente) vira null em vez de um número sem sentido.
 */
export function computeTireKm(tire: Pick<VehicleTireRow, "mounted_km" | "last_checked_km" | "expected_life_km">): TireKmComputed {
  if (tire.mounted_km === null || tire.last_checked_km === null) return { kmRodado: null, kmRestante: null };

  const kmRodado = Number(tire.last_checked_km) - Number(tire.mounted_km);
  if (kmRodado < 0) return { kmRodado: null, kmRestante: null };

  const kmRestante = tire.expected_life_km !== null ? Number(tire.expected_life_km) - kmRodado : null;
  return { kmRodado, kmRestante };
}
