import { companyPreferencesUpdateSchema } from "@/lib/validation/schemas";
import type { CompanyPreferencesRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Cria a linha de preferências (valores padrão) se ainda não existir. */
export async function getOrCreatePreferences(
  client: SupabaseDbClient,
  companyId: string
): Promise<CompanyPreferencesRow> {
  const { data: existing, error: selectError } = await client
    .from("company_preferences")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const { data: created, error: insertError } = await client
    .from("company_preferences")
    .insert({ company_id: companyId })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export async function updatePreferences(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  input: unknown
): Promise<CompanyPreferencesRow> {
  const parsed = companyPreferencesUpdateSchema.parse(input);

  const { data, error } = await client
    .from("company_preferences")
    .update({
      default_vehicle_id: parsed.defaultVehicleId,
      default_fuel_type: parsed.defaultFuelType,
      default_fuel_price: parsed.defaultFuelPrice,
      default_average_speed_kmh: parsed.defaultAverageSpeedKmh,
      default_target_margin_percent: parsed.defaultTargetMarginPercent,
      default_currency: parsed.defaultCurrency,
      distance_unit: parsed.distanceUnit,
      preferred_response_style: parsed.preferredResponseStyle,
      ask_before_saving_memory: parsed.askBeforeSavingMemory,
      allow_automatic_memory: parsed.allowAutomaticMemory,
      allow_analysis_history: parsed.allowAnalysisHistory,
      allow_tool_history: parsed.allowToolHistory,
      daily_news_enabled: parsed.dailyNewsEnabled,
      checklist_enabled: parsed.checklistEnabled,
      checklist_send_hour: parsed.checklistSendHour,
      checklist_item_keys: parsed.checklistItemKeys,
      freight_radar_analysis_mode: parsed.freightRadarAnalysisMode,
      updated_by: userId,
    })
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Empresas com notícias diárias ativadas e que ainda não receberam hoje
 * (daily_news_last_sent_at nulo ou anterior à meia-noite UTC de hoje) —
 * evita reenvio duplicado se o job de despacho rodar mais de uma vez no
 * mesmo dia (retry, múltiplas execuções do cron). Comparação em UTC por
 * simplicidade (mesmo padrão do resto do projeto); aceitável já que o
 * envio não precisa ser num horário exato, só uma vez por dia.
 */
export async function listCompaniesDueForNewsDigest(client: SupabaseDbClient, limit = 200): Promise<CompanyPreferencesRow[]> {
  const inicioDeHojeUtc = new Date();
  inicioDeHojeUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("company_preferences")
    .select("*")
    .eq("daily_news_enabled", true)
    .or(`daily_news_last_sent_at.is.null,daily_news_last_sent_at.lt.${inicioDeHojeUtc.toISOString()}`)
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function markNewsDigestSent(client: SupabaseDbClient, companyId: string): Promise<void> {
  const { error } = await client
    .from("company_preferences")
    .update({ daily_news_last_sent_at: new Date().toISOString() })
    .eq("company_id", companyId);

  if (error) throw error;
}

/** Salva o insight gerado pro Dashboard (V2) — cache lido/gravado por dashboardInsightService.ts. */
export async function saveDashboardInsight(client: SupabaseDbClient, companyId: string, texto: string): Promise<void> {
  const { error } = await client
    .from("company_preferences")
    .update({ dashboard_insight_text: texto, dashboard_insight_generated_at: new Date().toISOString() })
    .eq("company_id", companyId);

  if (error) throw error;
}

/**
 * Grava a região de atuação informada no onboarding como dado ESTRUTURAL
 * (fechamento de coerência 08/2026) — antes só existia em ai_memories,
 * sujeita a sair do top-12 do prompt da IA conforme a empresa acumulasse
 * memórias mais recentes. Garante a linha de preferências antes de
 * atualizar (onboarding roda antes de qualquer outro código que crie essa
 * linha lazy).
 */
export async function setOperatingRegion(client: SupabaseDbClient, companyId: string, region: string): Promise<void> {
  await getOrCreatePreferences(client, companyId);
  const { error } = await client.from("company_preferences").update({ operating_region: region }).eq("company_id", companyId);
  if (error) throw error;
}

/**
 * Guia de Primeiros Passos (V1 WhatsApp + V2 Painel, 08/2026) — estado
 * reaproveita `company_preferences` (mesmo padrão de `dashboard_insight_*`/
 * `daily_news_last_sent_at`: cache/estado simples por empresa, sem tabela
 * nova). "Experiência" V1/V2 é só um prefixo de coluna (`guide_v1_*`/
 * `guide_v2_*`) — as duas nunca se misturam, ver migration
 * 20260826150000. Guia ≠ onboarding — nunca lê/grava `onboarding_sessions`.
 */
export type GuideExperience = "v1" | "v2";
export type GuideStatus = "not_started" | "in_progress" | "completed" | "dismissed";

export interface GuideState {
  status: GuideStatus;
  step: string | null;
  offeredAt: string | null;
}

export async function getGuideState(client: SupabaseDbClient, companyId: string, experiencia: GuideExperience): Promise<GuideState> {
  const prefs = await getOrCreatePreferences(client, companyId);
  return experiencia === "v1"
    ? { status: prefs.guide_v1_status as GuideStatus, step: prefs.guide_v1_step, offeredAt: prefs.guide_v1_offered_at }
    : { status: prefs.guide_v2_status as GuideStatus, step: prefs.guide_v2_step, offeredAt: prefs.guide_v2_offered_at };
}

export interface SaveGuideStateInput {
  status: GuideStatus;
  step: string | null;
}

/** Update com chaves literais (nunca computadas): o tipo gerado pelo Supabase rejeita index signature dinâmica num `.update()`. */
export async function saveGuideState(
  client: SupabaseDbClient,
  companyId: string,
  experiencia: GuideExperience,
  input: SaveGuideStateInput
): Promise<void> {
  const update = experiencia === "v1" ? { guide_v1_status: input.status, guide_v1_step: input.step } : { guide_v2_status: input.status, guide_v2_step: input.step };
  const { error } = await client.from("company_preferences").update(update).eq("company_id", companyId);
  if (error) throw error;
}

/** Marca o convite inicial como já mostrado — garante oferta automática única (comando manual sempre funciona independentemente disso). Idempotente: chamar de novo só reescreve o mesmo timestamp mais recente. */
export async function markGuideOffered(client: SupabaseDbClient, companyId: string, experiencia: GuideExperience): Promise<void> {
  const agora = new Date().toISOString();
  const update = experiencia === "v1" ? { guide_v1_offered_at: agora } : { guide_v2_offered_at: agora };
  const { error } = await client.from("company_preferences").update(update).eq("company_id", companyId);
  if (error) throw error;
}
