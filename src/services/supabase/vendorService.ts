import { vendorCreateSchema, vendorUpdateSchema } from "@/lib/validation/schemas";
import type { VendorRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export async function listVendors(client: SupabaseDbClient, companyId: string): Promise<VendorRow[]> {
  const { data, error } = await client
    .from("vendors")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getVendor(client: SupabaseDbClient, vendorId: string): Promise<VendorRow | null> {
  const { data, error } = await client.from("vendors").select("*").eq("id", vendorId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createVendor(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  input: unknown
): Promise<VendorRow> {
  const parsed = vendorCreateSchema.parse(input);

  const { data, error } = await client
    .from("vendors")
    .insert({
      company_id: companyId,
      name: parsed.name,
      category: parsed.category ?? "outro",
      address: parsed.address,
      phone: parsed.phone,
      notes: parsed.notes,
      active: parsed.active ?? true,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** `companyId` sempre exigido no filtro — mesmo princípio de savedRouteService.updateRoute: nunca confiar só num id vindo do modelo. */
export async function updateVendor(
  client: SupabaseDbClient,
  vendorId: string,
  companyId: string,
  userId: string,
  input: unknown
): Promise<VendorRow> {
  const parsed = vendorUpdateSchema.parse(input);

  const { data, error } = await client
    .from("vendors")
    .update({
      name: parsed.name,
      category: parsed.category,
      address: parsed.address,
      phone: parsed.phone,
      notes: parsed.notes,
      active: parsed.active,
      updated_by: userId,
    })
    .eq("id", vendorId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Soft delete — mesmo padrão de deactivateRoute (nunca apaga histórico de vínculo com despesas/abastecimentos). */
export async function deactivateVendor(client: SupabaseDbClient, vendorId: string, companyId: string, userId: string): Promise<VendorRow> {
  const { data, error } = await client
    .from("vendors")
    .update({ active: false, updated_by: userId })
    .eq("id", vendorId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
