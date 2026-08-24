import type { ScheduledAlertRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export interface CreateAlertInput {
  companyId: string;
  userId: string;
  conversationId?: string;
  vehicleId?: string;
  title: string;
  notes?: string;
  category?: string;
  /** ISO 8601 com offset — sempre absoluto, resolvido antes de chegar aqui. */
  scheduledFor: string;
}

export async function createAlert(client: SupabaseDbClient, input: CreateAlertInput): Promise<ScheduledAlertRow> {
  const { data, error } = await client
    .from("scheduled_alerts")
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      conversation_id: input.conversationId,
      vehicle_id: input.vehicleId,
      title: input.title,
      notes: input.notes,
      category: input.category,
      scheduled_for: input.scheduledFor,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listUpcomingAlerts(
  client: SupabaseDbClient,
  companyId: string,
  limit = 10
): Promise<ScheduledAlertRow[]> {
  const { data, error } = await client
    .from("scheduled_alerts")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function cancelAlert(client: SupabaseDbClient, alertId: string, companyId: string): Promise<void> {
  const { error } = await client
    .from("scheduled_alerts")
    .update({ status: "cancelled" })
    .eq("id", alertId)
    .eq("company_id", companyId)
    .eq("status", "pending");

  if (error) throw error;
}

export type AlertOrigin = "manutencao" | "documento" | "checklist" | "manual";

/**
 * `category` é texto livre (sem enum/check no banco) — nunca confiável sozinho como discriminador.
 * A origem real vem dos FKs (`maintenance_schedule_id`/`vehicle_document_id`); checklist é a única
 * origem automática sem FK próprio, identificada pela convenção de `category: "checklist"` já usada
 * por `avisarGestorChecklistComAtencao`. Qualquer outra coisa é alerta manual (painel ou WhatsApp).
 */
export function resolveAlertOrigin(alert: Pick<ScheduledAlertRow, "maintenance_schedule_id" | "vehicle_document_id" | "category">): AlertOrigin {
  if (alert.maintenance_schedule_id) return "manutencao";
  if (alert.vehicle_document_id) return "documento";
  if (alert.category === "checklist") return "checklist";
  return "manual";
}

/** Só alertas manuais (sem origem automática) podem ser editados/cancelados diretamente — mesma regra que a RLS de escrita já aplica no banco (ver migration 20260824100000). */
export function isEditableAlert(alert: Pick<ScheduledAlertRow, "maintenance_schedule_id" | "vehicle_document_id">): boolean {
  return alert.maintenance_schedule_id === null && alert.vehicle_document_id === null;
}

export async function getAlert(client: SupabaseDbClient, alertId: string, companyId: string): Promise<ScheduledAlertRow | null> {
  const { data, error } = await client.from("scheduled_alerts").select("*").eq("id", alertId).eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpdateAlertInput {
  title?: string;
  notes?: string;
  vehicleId?: string | null;
  /** ISO 8601 com offset — sempre absoluto. */
  scheduledFor?: string;
}

/** companyId é filtro obrigatório — mesmo princípio de updateMaintenanceSchedule/updateExpense. A RLS já impede editar alerta de origem automática via client de sessão; isEditableAlert existe pra dar um erro amigável ANTES de tentar (em vez de deixar a RLS rejeitar silenciosamente). */
export async function updateAlert(client: SupabaseDbClient, alertId: string, companyId: string, input: UpdateAlertInput): Promise<ScheduledAlertRow> {
  const { data, error } = await client
    .from("scheduled_alerts")
    .update({
      title: input.title,
      notes: input.notes,
      vehicle_id: input.vehicleId,
      scheduled_for: input.scheduledFor,
    })
    .eq("id", alertId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export interface ListAlertsForPanelFilter {
  companyId: string;
  status?: "pending" | "sent" | "cancelled" | "failed" | "resolved";
  from?: string;
  to?: string;
  vehicleId?: string;
  limit?: number;
}

/**
 * Listagem para a tela do painel — diferente de listUpcomingAlerts (só pending, limit 10, pensada
 * pro contexto da IA): aqui é a fonte real e completa da tela /frota/alertas, com todos os status e
 * origens (manual/manutenção/documento/checklist — ver resolveAlertOrigin). Filtro de origem é
 * aplicado em memória pelo chamador (poucos registros, evita uma query dinâmica complexa por OR).
 */
export async function listAlertsForPanel(client: SupabaseDbClient, filter: ListAlertsForPanelFilter): Promise<ScheduledAlertRow[]> {
  let query = client
    .from("scheduled_alerts")
    .select("*")
    .eq("company_id", filter.companyId)
    .order("scheduled_for", { ascending: true })
    .limit(filter.limit ?? 200);

  if (filter.status) query = query.eq("status", filter.status);
  if (filter.from) query = query.gte("scheduled_for", filter.from);
  if (filter.to) query = query.lte("scheduled_for", filter.to);
  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Alertas pendentes com scheduled_for já vencido — usado pelo job de disparo. */
export async function listDueAlerts(client: SupabaseDbClient, limit = 50): Promise<ScheduledAlertRow[]> {
  const { data, error } = await client
    .from("scheduled_alerts")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * `.eq("status", "pending")` no WHERE (compare-and-swap): se duas execuções
 * concorrentes do cron pegarem o mesmo alerta em listDueAlerts, só a
 * primeira a chegar aqui realmente muda o status — a segunda vira um
 * update de 0 linhas em vez de sobrescrever silenciosamente um resultado
 * já gravado pela primeira.
 */
export async function markAlertSent(client: SupabaseDbClient, alertId: string): Promise<void> {
  const { error } = await client
    .from("scheduled_alerts")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("status", "pending");

  if (error) throw error;
}

export async function markAlertFailed(client: SupabaseDbClient, alertId: string, errorMessageSafe: string): Promise<void> {
  const { error } = await client
    .from("scheduled_alerts")
    .update({ status: "failed", error_message_safe: errorMessageSafe })
    .eq("id", alertId)
    .eq("status", "pending");

  if (error) throw error;
}
