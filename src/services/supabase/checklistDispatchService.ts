import type { ChecklistDispatchRow, ChecklistResponseStatusEnum, DriverRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Só leitura pro painel — a escrita (Fase 6 do plano de unificação V1+V2) acontece só via o cron de disparo e a resposta do motorista pelo WhatsApp, nunca pela sessão do navegador. */
export async function listChecklistDispatchesForPanel(
  client: SupabaseDbClient,
  companyId: string
): Promise<ChecklistDispatchRow[]> {
  const { data, error } = await client
    .from("checklist_dispatches")
    .select("*")
    .eq("company_id", companyId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Início do dia atual em horário de Brasília (UTC-3), já convertido pra UTC —
 * aproximação simples, sem preferência de fuso por empresa ainda (fora do
 * escopo desta fase). Extraído pra ser reaproveitado por qualquer consumidor
 * que precise filtrar "o que aconteceu hoje" (elegibilidade de disparo,
 * painel do Dashboard).
 */
export function startOfTodayBrasilia(): Date {
  const inicioDoDiaBrasilia = new Date();
  inicioDoDiaBrasilia.setUTCHours(3, 0, 0, 0); // 00:00 em Brasília (UTC-3) já em UTC
  if (inicioDoDiaBrasilia.getTime() > Date.now()) {
    inicioDoDiaBrasilia.setUTCDate(inicioDoDiaBrasilia.getUTCDate() - 1);
  }
  return inicioDoDiaBrasilia;
}

/** Filtra os dispatches já carregados pra só os enviados hoje (Brasília) — função pura, usada pelo Dashboard. */
export function dispatchesFromToday(dispatches: ChecklistDispatchRow[]): ChecklistDispatchRow[] {
  const inicioDoDiaBrasilia = startOfTodayBrasilia();
  return dispatches.filter((d) => new Date(d.sent_at).getTime() >= inicioDoDiaBrasilia.getTime());
}

/**
 * Motoristas elegíveis pro checklist diário: ativos, com veículo e telefone
 * vinculados, que ainda não receberam um checklist HOJE (evita duplicar se
 * o cron rodar mais de uma vez no mesmo dia).
 */
export async function listDriversDueForChecklist(client: SupabaseDbClient): Promise<DriverRow[]> {
  const inicioDoDiaBrasilia = startOfTodayBrasilia();

  const { data: motoristas, error } = await client
    .from("drivers")
    .select("*")
    .eq("active", true)
    .not("vehicle_id", "is", null)
    .not("phone_e164", "is", null);
  if (error) throw error;
  if (!motoristas || motoristas.length === 0) return [];

  const { data: jaEnviados, error: erroDispatches } = await client
    .from("checklist_dispatches")
    .select("driver_id")
    .gte("sent_at", inicioDoDiaBrasilia.toISOString())
    .in(
      "driver_id",
      motoristas.map((m) => m.id)
    );
  if (erroDispatches) throw erroDispatches;

  const idsComEnvioHoje = new Set((jaEnviados ?? []).map((d) => d.driver_id));
  return motoristas.filter((m) => !idsComEnvioHoje.has(m.id));
}

export interface CreateChecklistDispatchInput {
  companyId: string;
  driverId: string;
  vehicleId: string;
}

export async function createChecklistDispatch(client: SupabaseDbClient, input: CreateChecklistDispatchInput): Promise<ChecklistDispatchRow> {
  const { data, error } = await client
    .from("checklist_dispatches")
    .insert({ company_id: input.companyId, driver_id: input.driverId, vehicle_id: input.vehicleId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Acha o checklist pendente mais recente de um motorista pelo telefone —
 * usado pelo webhook do WhatsApp pra saber se a mensagem que chegou é
 * resposta de checklist, antes de tentar resolver como usuário/onboarding
 * (motorista não é conta de usuário, não pode cair no fluxo de cadastro).
 * Janela de 48h: dispatch mais antigo que isso não é mais interceptado —
 * evita uma pendência esquecida sequestrar mensagens futuras do motorista
 * pra sempre.
 */
export async function findPendingChecklistDispatchByPhone(
  client: SupabaseDbClient,
  phoneE164: string
): Promise<{ dispatch: ChecklistDispatchRow; driver: DriverRow } | null> {
  const { data: driver, error: erroDriver } = await client.from("drivers").select("*").eq("phone_e164", phoneE164).eq("active", true).maybeSingle();
  if (erroDriver) throw erroDriver;
  if (!driver) return null;

  const janela = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: dispatch, error: erroDispatch } = await client
    .from("checklist_dispatches")
    .select("*")
    .eq("driver_id", driver.id)
    .eq("response_status", "pendente")
    .gte("sent_at", janela)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroDispatch) throw erroDispatch;
  if (!dispatch) return null;

  return { dispatch, driver };
}

const RESPOSTAS_OK = ["ok", "tudo ok", "tudo certo", "tudo bem", "sem problema", "sem problemas", "beleza", "tranquilo", "👍", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿"];

/** Ambíguo vira 'atencao' de propósito — mais seguro sinalizar pra revisão humana do que dar como OK silenciosamente. */
export function interpretarRespostaChecklist(texto: string): ChecklistResponseStatusEnum {
  return RESPOSTAS_OK.includes(texto.trim().toLowerCase()) ? "ok" : "atencao";
}

export async function recordChecklistResponse(client: SupabaseDbClient, dispatchId: string, responseText: string): Promise<ChecklistDispatchRow> {
  const { data, error } = await client
    .from("checklist_dispatches")
    .update({
      response_status: interpretarRespostaChecklist(responseText),
      response_text: responseText,
      responded_at: new Date().toISOString(),
    })
    .eq("id", dispatchId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
