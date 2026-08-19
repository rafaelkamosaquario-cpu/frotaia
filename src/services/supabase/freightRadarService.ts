import { freightRadarCreateSchema, freightRadarUpdateSchema } from "@/lib/validation/schemas";
import type { FreightRadarRow, FreightRadarStatusEnum } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Duração padrão quando o cliente não informa prazo (etapa 4 da spec) — documentado, ajustável. */
export const RADAR_DURACAO_PADRAO_DIAS = 7;

function calcularExpiresAt(availableUntil: string | null | undefined): string {
  if (availableUntil) {
    const data = new Date(`${availableUntil}T23:59:59-03:00`);
    if (!Number.isNaN(data.getTime())) return data.toISOString();
  }
  const padrao = new Date();
  padrao.setUTCDate(padrao.getUTCDate() + RADAR_DURACAO_PADRAO_DIAS);
  return padrao.toISOString();
}

export async function createRadar(client: SupabaseDbClient, companyId: string, userId: string, input: unknown): Promise<FreightRadarRow> {
  const parsed = freightRadarCreateSchema.parse(input);

  const { data, error } = await client
    .from("freight_radars")
    .insert({
      company_id: companyId,
      user_id: userId,
      vehicle_id: parsed.vehicleId,
      origin_city: parsed.originCity,
      origin_state: parsed.originState,
      destination_city: parsed.destinationCity,
      destination_state: parsed.destinationState,
      destination_region_label: parsed.destinationRegionLabel,
      available_from: parsed.availableFrom,
      available_until: parsed.availableUntil,
      notes: parsed.notes,
      expires_at: calcularExpiresAt(parsed.availableUntil),
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateRadar(client: SupabaseDbClient, radarId: string, companyId: string, userId: string, input: unknown): Promise<FreightRadarRow> {
  const parsed = freightRadarUpdateSchema.parse(input);

  const { data, error } = await client
    .from("freight_radars")
    .update({
      vehicle_id: parsed.vehicleId,
      origin_city: parsed.originCity,
      origin_state: parsed.originState,
      destination_city: parsed.destinationCity,
      destination_state: parsed.destinationState,
      destination_region_label: parsed.destinationRegionLabel,
      available_from: parsed.availableFrom,
      available_until: parsed.availableUntil,
      notes: parsed.notes,
      ...(parsed.availableUntil !== undefined ? { expires_at: calcularExpiresAt(parsed.availableUntil) } : {}),
      updated_by: userId,
    })
    .eq("id", radarId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function setRadarStatus(client: SupabaseDbClient, radarId: string, companyId: string, userId: string, status: FreightRadarStatusEnum): Promise<FreightRadarRow> {
  const { data, error } = await client
    .from("freight_radars")
    .update({ status, updated_by: userId })
    .eq("id", radarId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listRadarsForCompany(client: SupabaseDbClient, companyId: string): Promise<FreightRadarRow[]> {
  const { data, error } = await client.from("freight_radars").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Radares ativos só desta empresa — usado pelo system prompt (customerContext.ts), mesma lógica de bloco condicional que vehicle/costProfile. */
export async function listActiveRadarsForPrompt(client: SupabaseDbClient, companyId: string): Promise<FreightRadarRow[]> {
  const { data, error } = await client
    .from("freight_radars")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Só radares ativos de TODAS as empresas — usado pelo motor de matching (client admin), nunca exposto direto ao painel. */
export async function listAllActiveRadars(client: SupabaseDbClient): Promise<FreightRadarRow[]> {
  const { data, error } = await client.from("freight_radars").select("*").eq("status", "active").gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return data ?? [];
}

/** Marca como expirado todo radar ativo cujo expires_at já passou — chamado pelo cron de expiração. */
export async function expireOverdueRadars(client: SupabaseDbClient): Promise<number> {
  const { data, error } = await client
    .from("freight_radars")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}
