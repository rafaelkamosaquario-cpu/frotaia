import { toJson } from "@/lib/supabase/json";
import type { FreightOpportunityRow, FreightOpportunitySourceEnum, FreightOpportunityStatusEnum } from "@/lib/supabase/tables";
import type { ExtracaoOportunidade } from "@/services/freight/opportunityExtraction";
import type { SupabaseDbClient } from "./types";

/** Carga recebida costuma ficar obsoleta rápido — janela curta, documentada. */
export const OPORTUNIDADE_EXPIRACAO_HORAS = 48;

/** Repost da mesma carga com messageId novo (não pega no índice único) — janela de deduplicação "por similaridade". */
export const JANELA_DEDUP_SIMILARIDADE_HORAS = 6;

export interface CriarOportunidadeInput {
  source: FreightOpportunitySourceEnum;
  sourceGroupId?: string | null;
  sourceGroupName?: string | null;
  originalMessageId?: string | null;
  originalText: string;
  extracao: ExtracaoOportunidade;
  rawPayload?: unknown;
}

function calcularExpiresAt(): string {
  const data = new Date();
  data.setUTCHours(data.getUTCHours() + OPORTUNIDADE_EXPIRACAO_HORAS);
  return data.toISOString();
}

/**
 * Retorna null quando já existe oportunidade idêntica (mesmo grupo + mesmo
 * messageId — índice único no banco) — dedup exata, etapa 19 da spec.
 * Reposts com messageId novo não são pegos aqui, ver findOpportunitySimilarRecent.
 */
export async function createOpportunity(client: SupabaseDbClient, input: CriarOportunidadeInput): Promise<FreightOpportunityRow | null> {
  const status: FreightOpportunityStatusEnum = input.extracao.originState || input.extracao.destinationState ? "new" : "incomplete";

  const { data, error } = await client
    .from("freight_opportunities")
    .insert({
      source: input.source,
      source_group_id: input.sourceGroupId ?? null,
      source_group_name: input.sourceGroupName ?? null,
      original_message_id: input.originalMessageId ?? null,
      original_text: input.originalText,
      origin_city: input.extracao.originCity,
      origin_state: input.extracao.originState,
      destination_city: input.extracao.destinationCity,
      destination_state: input.extracao.destinationState,
      pickup_date: input.extracao.pickupDate,
      body_type: input.extracao.bodyType,
      weight_kg: input.extracao.weightKg,
      freight_value_cents: input.extracao.freightValueCents,
      contact_text: input.extracao.contactText,
      status,
      expires_at: calcularExpiresAt(),
      raw_payload: input.rawPayload ? toJson(input.rawPayload as Record<string, unknown>) : null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return null; // unique_violation — já existe (dedup exato)
    throw error;
  }
  return data;
}

/** Dedup "por similaridade" (etapa 19): mesmo grupo, mesma origem/destino/valor, dentro da janela recente — pega repost com messageId novo. */
export async function findOpportunitySimilarRecent(
  client: SupabaseDbClient,
  sourceGroupId: string,
  originState: string | null,
  destinationState: string | null,
  freightValueCents: number | null
): Promise<FreightOpportunityRow | null> {
  const desde = new Date();
  desde.setUTCHours(desde.getUTCHours() - JANELA_DEDUP_SIMILARIDADE_HORAS);

  let query = client
    .from("freight_opportunities")
    .select("*")
    .eq("source_group_id", sourceGroupId)
    .gte("captured_at", desde.toISOString());

  query = originState ? query.eq("origin_state", originState) : query.is("origin_state", null);
  query = destinationState ? query.eq("destination_state", destinationState) : query.is("destination_state", null);
  query = freightValueCents !== null ? query.eq("freight_value_cents", freightValueCents) : query.is("freight_value_cents", null);

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOpportunity(client: SupabaseDbClient, opportunityId: string): Promise<FreightOpportunityRow | null> {
  const { data, error } = await client.from("freight_opportunities").select("*").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Oportunidades ainda relevantes (não expiradas) por UF de origem/destino — usado pelo motor de matching. */
export async function listOpenOpportunitiesByRegion(client: SupabaseDbClient, originState: string | null, destinationState: string | null): Promise<FreightOpportunityRow[]> {
  let query = client
    .from("freight_opportunities")
    .select("*")
    .in("status", ["new", "incomplete"])
    .gt("expires_at", new Date().toISOString());

  if (originState) query = query.eq("origin_state", originState);
  if (destinationState) query = query.eq("destination_state", destinationState);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function expireOverdueOpportunities(client: SupabaseDbClient): Promise<number> {
  const { data, error } = await client
    .from("freight_opportunities")
    .update({ status: "expired" })
    .in("status", ["new", "incomplete"])
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
