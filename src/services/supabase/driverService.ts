import { driverCreateSchema, driverUpdateSchema } from "@/lib/validation/schemas";
import type { DriverRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Todos os motoristas da empresa (ativos e inativos) — painel V2, mesmo espírito de listVehiclesForPanel. */
export async function listDriversForPanel(client: SupabaseDbClient, companyId: string): Promise<DriverRow[]> {
  const { data, error } = await client
    .from("drivers")
    .select("*")
    .eq("company_id", companyId)
    .order("active", { ascending: false })
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createDriver(client: SupabaseDbClient, companyId: string, input: unknown): Promise<DriverRow> {
  const parsed = driverCreateSchema.parse(input);

  const { data, error } = await client
    .from("drivers")
    .insert({
      company_id: companyId,
      name: parsed.name,
      phone_e164: parsed.phoneE164,
      vehicle_id: parsed.vehicleId,
      cnh_expiry_date: parsed.cnhExpiryDate,
      toxicologico_expiry_date: parsed.toxicologicoExpiryDate,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateVehicle. */
export async function updateDriver(
  client: SupabaseDbClient,
  driverId: string,
  companyId: string,
  input: unknown
): Promise<DriverRow> {
  const parsed = driverUpdateSchema.parse(input);

  const { data, error } = await client
    .from("drivers")
    .update({
      name: parsed.name,
      phone_e164: parsed.phoneE164,
      vehicle_id: parsed.vehicleId,
      cnh_expiry_date: parsed.cnhExpiryDate,
      toxicologico_expiry_date: parsed.toxicologicoExpiryDate,
      active: parsed.active,
    })
    .eq("id", driverId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
