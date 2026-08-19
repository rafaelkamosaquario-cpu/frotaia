import type { FreightSourceRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Usado pelo webhook (client admin) pra decidir se processa uma mensagem de grupo. */
export async function isGroupAuthorized(client: SupabaseDbClient, groupExternalId: string): Promise<boolean> {
  const { data, error } = await client
    .from("freight_sources")
    .select("id")
    .eq("group_external_id", groupExternalId)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Fontes privadas da empresa (painel de gestão) — nunca inclui fontes globais (company_id nulo), essas são só backend. */
export async function listSourcesForCompany(client: SupabaseDbClient, companyId: string): Promise<FreightSourceRow[]> {
  const { data, error } = await client.from("freight_sources").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSource(client: SupabaseDbClient, companyId: string, userId: string, groupExternalId: string, groupName: string | null): Promise<FreightSourceRow> {
  const { data, error } = await client
    .from("freight_sources")
    .insert({ company_id: companyId, group_external_id: groupExternalId, group_name: groupName, created_by: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function setSourceEnabled(client: SupabaseDbClient, sourceId: string, companyId: string, enabled: boolean): Promise<FreightSourceRow> {
  const { data, error } = await client
    .from("freight_sources")
    .update({ enabled })
    .eq("id", sourceId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
