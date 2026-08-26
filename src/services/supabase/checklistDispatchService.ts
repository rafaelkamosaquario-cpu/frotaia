import type { ChecklistDispatchRow, ChecklistResponseStatusEnum, DriverRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Chaves fixas dos itens do checklist (B.1) — sem editor de formulário livre, só label mapeado. Empresa liga/desliga cada um em company_preferences.checklist_item_keys. */
export const CHECKLIST_ITEM_LABELS: Record<string, string> = {
  oleo: "óleo",
  agua: "água",
  pneus: "pneus",
  luzes: "luzes",
};

/** Busca checklist_item_keys por empresa, pra montar o texto do disparo com os itens realmente ativados (B.2). */
export async function listChecklistItemKeysByCompany(
  client: SupabaseDbClient,
  companyIds: string[]
): Promise<Map<string, string[]>> {
  if (companyIds.length === 0) return new Map();

  const { data, error } = await client
    .from("company_preferences")
    .select("company_id, checklist_item_keys")
    .in("company_id", companyIds);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.company_id, row.checklist_item_keys]));
}

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

/** Hora atual em Brasília (0-23), aproximação fixa UTC-3 — mesmo princípio de startOfTodayBrasilia. */
function horaAtualBrasilia(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

/**
 * Motoristas elegíveis pro checklist diário: da empresa com checklist
 * ativado (`company_preferences.checklist_enabled`) e já no horário
 * configurado (`checklist_send_hour`, Brasília) ou depois dele, ativos, com
 * veículo e telefone vinculados, que ainda não receberam um checklist HOJE
 * (evita duplicar se o cron rodar mais de uma vez no mesmo dia — a rota
 * roda a cada poucos minutos, não só uma vez, pra respeitar o horário por
 * empresa em vez de um horário fixo global).
 */
export async function listDriversDueForChecklist(client: SupabaseDbClient): Promise<DriverRow[]> {
  const inicioDoDiaBrasilia = startOfTodayBrasilia();
  const horaAtual = horaAtualBrasilia();

  const { data: empresasElegiveis, error: erroEmpresas } = await client
    .from("company_preferences")
    .select("company_id")
    .eq("checklist_enabled", true)
    .lte("checklist_send_hour", horaAtual);
  if (erroEmpresas) throw erroEmpresas;
  if (!empresasElegiveis || empresasElegiveis.length === 0) return [];

  const { data: motoristas, error } = await client
    .from("drivers")
    .select("*")
    .eq("active", true)
    .not("vehicle_id", "is", null)
    .not("phone_e164", "is", null)
    .in(
      "company_id",
      empresasElegiveis.map((e) => e.company_id)
    );
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
 * Compensação pro caso de "registro fantasma" (prontidão de produção,
 * 08/2026): o dispatch é gravado ANTES do envio pelo WhatsApp (de propósito
 * — garante que uma resposta rápida demais do motorista já encontre o
 * registro `pendente`). Se o envio falhar de verdade, `listDriversDueForChecklist`
 * passaria a ignorar esse motorista pelo resto do dia (já tem dispatch
 * "hoje"), mesmo sem ele ter recebido nada. Chamado só nesse caminho de
 * falha, pra devolver o motorista à fila de elegíveis do próximo cron.
 */
export async function deleteChecklistDispatch(client: SupabaseDbClient, dispatchId: string): Promise<void> {
  const { error } = await client.from("checklist_dispatches").delete().eq("id", dispatchId);
  if (error) throw error;
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

/**
 * Prazo pra considerar um checklist ainda `pendente` "não respondido" de
 * fato (B.3) — não é um 4º valor no enum do Postgres (arriscado demais
 * mudar isso em produção sem necessidade real); é um estado COMPUTADO:
 * `pendente` + `sent_at` mais antigo que este prazo. Constante documentada
 * em vez de configurável nesta fase — 6h cobre a janela matinal de saída
 * típica do setor.
 */
export const CHECKLIST_PRAZO_RESPOSTA_HORAS = 6;

/** true se um dispatch `pendente` já passou do prazo de resposta (B.3) — usado pela agregação de aderência. */
export function estaNaoRespondido(dispatch: Pick<ChecklistDispatchRow, "response_status" | "sent_at">): boolean {
  if (dispatch.response_status !== "pendente") return false;
  const limiteMs = CHECKLIST_PRAZO_RESPOSTA_HORAS * 60 * 60 * 1000;
  return Date.now() - new Date(dispatch.sent_at).getTime() >= limiteMs;
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

  if (data.response_status === "atencao") {
    // Nunca deixa a criação do alerta quebrar a resposta ao motorista (mesmo padrão defensivo de finalizeOnboarding.ts).
    await avisarGestorChecklistComAtencao(client, data).catch((erro) => {
      console.error(`[checklist] falha ao criar alerta de atenção pro dispatch ${data.id}:`, erro);
    });
  }

  return data;
}

/** B.4: cria um scheduled_alerts pra cada owner/admin da empresa, reaproveitando o cron de alerta já existente (/api/alerts/dispatch) em vez de inventar canal de notificação novo. */
async function avisarGestorChecklistComAtencao(client: SupabaseDbClient, dispatch: ChecklistDispatchRow): Promise<void> {
  const [{ data: driver }, { data: gestores, error: erroGestores }] = await Promise.all([
    client.from("drivers").select("name").eq("id", dispatch.driver_id).maybeSingle(),
    client.from("company_members").select("user_id").eq("company_id", dispatch.company_id).in("role", ["owner", "admin"]),
  ]);
  if (erroGestores) throw erroGestores;
  if (!gestores || gestores.length === 0) return;

  let nomeVeiculo = "veículo";
  if (dispatch.vehicle_id) {
    const { data: veiculo } = await client.from("vehicles").select("name, plate").eq("id", dispatch.vehicle_id).maybeSingle();
    if (veiculo) nomeVeiculo = veiculo.name || veiculo.plate || nomeVeiculo;
  }

  const titulo = `Checklist com atenção — ${driver?.name ?? "motorista"} (${nomeVeiculo})`;

  const { error } = await client.from("scheduled_alerts").insert(
    gestores.map((g) => ({
      company_id: dispatch.company_id,
      user_id: g.user_id,
      vehicle_id: dispatch.vehicle_id,
      title: titulo,
      notes: dispatch.response_text,
      category: "checklist",
      scheduled_for: new Date().toISOString(),
    }))
  );
  if (error) throw error;
}
