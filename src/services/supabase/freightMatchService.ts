import type { FreightMatchStatusEnum, FreightOpportunityMatchRow, FreightOpportunityRow } from "@/lib/supabase/tables";
import { getOpportunity } from "./freightOpportunityService";
import type { SupabaseDbClient } from "./types";

export interface MatchComOportunidade extends FreightOpportunityMatchRow {
  opportunity: FreightOpportunityRow;
}

/**
 * Junta match (isolado por RLS/company_id) com a oportunidade (sem RLS
 * própria — ver comentário da migration). `client` aqui deve sempre ser o
 * client ADMIN: a lista de matches já vem filtrada por companyId (com RLS
 * quando o caller usa client de sessão), então buscar a oportunidade ligada
 * a cada match confirmado não vaza nada entre empresas.
 */
export async function listMatchesWithOpportunityForCompany(client: SupabaseDbClient, companyId: string, status?: FreightMatchStatusEnum): Promise<MatchComOportunidade[]> {
  const matches = await listMatchesForCompany(client, companyId, status);
  const resultado: MatchComOportunidade[] = [];
  for (const match of matches) {
    const opportunity = await getOpportunity(client, match.opportunity_id);
    if (opportunity) resultado.push({ ...match, opportunity });
  }
  return resultado;
}

/**
 * Idempotente por desenho: a constraint única (opportunity_id, radar_id)
 * garante que a mesma oportunidade nunca gera 2 matches pro mesmo radar,
 * mesmo se o motor de matching rodar 2x pra mesma mensagem de grupo.
 */
export async function createMatch(
  client: SupabaseDbClient,
  opportunityId: string,
  radarId: string,
  companyId: string,
  vehicleId: string | null,
  compatibilityScore: number
): Promise<FreightOpportunityMatchRow | null> {
  const { data, error } = await client
    .from("freight_opportunity_matches")
    .insert({
      opportunity_id: opportunityId,
      radar_id: radarId,
      company_id: companyId,
      vehicle_id: vehicleId,
      compatibility_score: compatibilityScore,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return null; // já existe match pra esse par
    throw error;
  }
  return data;
}

export async function listMatchesForCompany(client: SupabaseDbClient, companyId: string, status?: FreightMatchStatusEnum): Promise<FreightOpportunityMatchRow[]> {
  let query = client.from("freight_opportunity_matches").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getMatch(client: SupabaseDbClient, matchId: string, companyId: string): Promise<FreightOpportunityMatchRow | null> {
  const { data, error } = await client.from("freight_opportunity_matches").select("*").eq("id", matchId).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function markMatchNotified(client: SupabaseDbClient, matchId: string): Promise<void> {
  const { error } = await client
    .from("freight_opportunity_matches")
    .update({ status: "notified", notified_at: new Date().toISOString() })
    .eq("id", matchId)
    .eq("status", "new");
  if (error) throw error;
}

export async function updateMatchStatus(client: SupabaseDbClient, matchId: string, companyId: string, status: FreightMatchStatusEnum, decision?: string): Promise<FreightOpportunityMatchRow> {
  const extra = status === "viewed" ? { viewed_at: new Date().toISOString() } : {};
  const { data, error } = await client
    .from("freight_opportunity_matches")
    .update({ status, decision: decision ?? null, ...extra })
    .eq("id", matchId)
    .eq("company_id", companyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function markMatchAnalyzed(client: SupabaseDbClient, matchId: string, companyId: string, analysisRunId: string): Promise<void> {
  const { error } = await client
    .from("freight_opportunity_matches")
    .update({ status: "analyzed", analysis_run_id: analysisRunId })
    .eq("id", matchId)
    .eq("company_id", companyId);
  if (error) throw error;
}
