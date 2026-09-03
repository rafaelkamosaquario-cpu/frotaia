import type { MaintenanceScheduleRow, VehicleDocumentRow, VehicleDocumentTypeEnum, VehicleRow, VehicleTireRow } from "@/lib/supabase/tables";
import { listVehiclesForPanel } from "./vehicleService";
import { listMaintenanceSchedulesForPanel } from "./maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "./vehicleDocumentService";
import { computeTireKm } from "./vehicleTireService";
import type { SupabaseDbClient } from "./types";

/**
 * Lógica de "vencendo/atrasado" da frota (documentos + manutenções) —
 * extraída de `AlertasClient.tsx` (onde vivia presa a um componente client)
 * para ser reaproveitada por qualquer consumidor: a tela Alertas do painel
 * e uma futura ferramenta de consulta via WhatsApp. A tela Alertas continua
 * derivando ao vivo (`listFleetAlerts`) — sempre correta, sem risco de
 * ficar desatualizada se algum caminho de escrita esquecer de sincronizar.
 *
 * `syncMaintenanceAlert`/`syncDocumentAlert` (Fase 5 do plano de unificação
 * V1+V2) alimentam `scheduled_alerts` — a fila real que o cron de disparo
 * (`/api/alerts/dispatch`) lê pra mandar aviso pelo WhatsApp. É a peça que
 * fecha o caminho painel→WhatsApp: antes, vencimento de manutenção/
 * documento só aparecia se o cliente abrisse a tela Alertas.
 */

export interface FleetAlertItem {
  id: string;
  descricao: string;
  data: string;
  vencido: boolean;
  diasRestantes: number;
  href: string;
}

const DOCUMENT_TYPE_LABEL: Record<VehicleDocumentTypeEnum, string> = {
  tacografo: "Tacógrafo",
  rntrc: "RNTRC",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

export const LIMITE_DIAS_PADRAO = 30;

export function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function descricaoUrgencia(dias: number): string {
  if (dias < 0) return `vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "vence hoje";
  return `vence em ${dias} dia(s)`;
}

export interface ComputeFleetAlertsInput {
  veiculos: VehicleRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
}

/** Função pura — sem I/O, reaproveitável em qualquer ambiente (client component, cron, ferramenta de IA). */
export function computeFleetAlerts(input: ComputeFleetAlertsInput, limiteDias: number = LIMITE_DIAS_PADRAO): FleetAlertItem[] {
  const veiculosPorId = new Map(input.veiculos.map((v) => [v.id, v]));

  const deDocumentos: FleetAlertItem[] = input.documentos
    .filter((d): d is VehicleDocumentRow & { expiry_date: string } => !!d.expiry_date && diasAte(d.expiry_date) <= limiteDias)
    .map((d) => {
      const dias = diasAte(d.expiry_date);
      const veiculo = d.vehicle_id ? veiculosPorId.get(d.vehicle_id) : null;
      const alvo = veiculo ? veiculo.name || veiculo.plate : "motorista vinculado";
      return {
        id: `doc-${d.id}`,
        descricao: `${DOCUMENT_TYPE_LABEL[d.document_type]} — ${alvo} — ${descricaoUrgencia(dias)}`,
        data: d.expiry_date,
        vencido: dias < 0,
        diasRestantes: dias,
        href: "/frota/documentos",
      };
    });

  const deManutencoes: FleetAlertItem[] = input.manutencoes
    .filter((m) => m.status !== "concluido" && m.status !== "cancelado" && diasAte(m.due_date) <= limiteDias)
    .map((m) => {
      const dias = diasAte(m.due_date);
      const veiculo = veiculosPorId.get(m.vehicle_id);
      const alvo = veiculo ? veiculo.name || veiculo.plate : "veículo";
      return {
        id: `man-${m.id}`,
        descricao: `${m.type} — ${alvo} — ${descricaoUrgencia(dias)}`,
        data: m.due_date,
        vencido: dias < 0,
        diasRestantes: dias,
        href: "/frota/manutencao",
      };
    });

  return [...deDocumentos, ...deManutencoes].sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/** Busca veículos/manutenções/documentos da empresa e já deriva a lista — evita todo consumidor precisar repetir os 3 fetches. */
export async function listFleetAlerts(
  client: SupabaseDbClient,
  companyId: string,
  limiteDias: number = LIMITE_DIAS_PADRAO
): Promise<FleetAlertItem[]> {
  const [veiculos, manutencoes, documentos] = await Promise.all([
    listVehiclesForPanel(client, companyId),
    listMaintenanceSchedulesForPanel(client, companyId),
    listVehicleDocumentsForPanel(client, companyId),
  ]);

  return computeFleetAlerts({ veiculos, manutencoes, documentos }, limiteDias);
}

/**
 * Horário fixo de disparo (11h em Brasília) — não existe preferência de
 * horário configurável ainda (fora do pedido desta fase, ver Configurações
 * numa fase futura). `due_date`/`expiry_date` são só a data (sem hora).
 */
function horarioDoDisparo(dataIso: string): string {
  return `${dataIso}T11:00:00-03:00`;
}

/**
 * Mantém `scheduled_alerts` coerente com o estado atual de uma manutenção —
 * chamada sempre que `gerenciar_manutencao`/`/api/frota/manutencao` cria ou
 * atualiza uma linha. Nunca cria um 2º alerta pendente pra mesma manutenção
 * (índice único parcial `scheduled_alerts_maintenance_pending_unique_idx`).
 */
export async function syncMaintenanceAlert(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  schedule: MaintenanceScheduleRow
): Promise<void> {
  const { data: pendente, error: erroConsulta } = await client
    .from("scheduled_alerts")
    .select("id")
    .eq("maintenance_schedule_id", schedule.id)
    .eq("status", "pending")
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;

  if (schedule.status === "concluido" || schedule.status === "cancelado") {
    if (pendente) {
      const { error } = await client
        .from("scheduled_alerts")
        .update({ status: schedule.status === "concluido" ? "resolved" : "cancelled" })
        .eq("id", pendente.id);
      if (error) throw error;
    }
    return;
  }

  const titulo = `Manutenção: ${schedule.type}`;
  const agendadoPara = horarioDoDisparo(schedule.due_date);

  if (pendente) {
    const { error } = await client.from("scheduled_alerts").update({ title: titulo, scheduled_for: agendadoPara, vehicle_id: schedule.vehicle_id }).eq("id", pendente.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("scheduled_alerts").insert({
    company_id: companyId,
    user_id: userId,
    maintenance_schedule_id: schedule.id,
    vehicle_id: schedule.vehicle_id,
    title: titulo,
    category: "manutencao",
    scheduled_for: agendadoPara,
    status: "pending",
  });
  if (error) throw error;
}

/**
 * Mesmo princípio de `syncMaintenanceAlert`, pra vencimento de documento
 * (tacógrafo/RNTRC/CNH/toxicológico/seguro/licenciamento). Documento sem
 * `expiry_date` não tem o que alertar — cancela um pendente existente, se
 * houver (ex.: cliente apagou a data por engano).
 */
export async function syncDocumentAlert(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  documento: VehicleDocumentRow
): Promise<void> {
  const { data: pendente, error: erroConsulta } = await client
    .from("scheduled_alerts")
    .select("id")
    .eq("vehicle_document_id", documento.id)
    .eq("status", "pending")
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;

  if (!documento.expiry_date) {
    if (pendente) {
      const { error } = await client.from("scheduled_alerts").update({ status: "cancelled" }).eq("id", pendente.id);
      if (error) throw error;
    }
    return;
  }

  const titulo = `${DOCUMENT_TYPE_LABEL[documento.document_type]} vencendo`;
  const agendadoPara = horarioDoDisparo(documento.expiry_date);

  if (pendente) {
    const { error } = await client
      .from("scheduled_alerts")
      .update({ title: titulo, scheduled_for: agendadoPara, vehicle_id: documento.vehicle_id })
      .eq("id", pendente.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("scheduled_alerts").insert({
    company_id: companyId,
    user_id: userId,
    vehicle_document_id: documento.id,
    vehicle_id: documento.vehicle_id,
    title: titulo,
    category: "documento",
    scheduled_for: agendadoPara,
    status: "pending",
  });
  if (error) throw error;
}

/** Km restante abaixo disso dispara alerta automático de pneu (item 3/5 da rodada de evolução funcional 09/2026) — mesmo espírito do LIMITE_DIAS_PADRAO acima, só que por km em vez de data. */
export const LIMIAR_KM_RESTANTE_PNEU_PADRAO = 1000;

/**
 * Mesmo princípio de `syncMaintenanceAlert`/`syncDocumentAlert`, mas
 * disparado por KM em vez de data — chamado sempre que
 * `gerenciar_pneu_veiculo` (modo ATUALIZAR_KM) ou `/api/frota/pneus`
 * atualiza a leitura de km de um pneu. Sem data prevista pra "vencer": o
 * alerta é agendado pra agora mesmo (`scheduled_for = now()`), já que a
 * condição (km restante baixo) já é verdadeira no momento da leitura —
 * o próximo ciclo do cron de disparo (`/api/alerts/dispatch`) já pega.
 */
export async function syncTireAlert(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  tire: VehicleTireRow,
  limiarKm: number = LIMIAR_KM_RESTANTE_PNEU_PADRAO
): Promise<void> {
  const { data: pendente, error: erroConsulta } = await client
    .from("scheduled_alerts")
    .select("id")
    .eq("vehicle_tire_id", tire.id)
    .eq("status", "pending")
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;

  const { kmRestante } = computeTireKm(tire);
  const precisaAlerta = tire.status === "montado" && kmRestante !== null && kmRestante <= limiarKm;

  if (!precisaAlerta) {
    if (pendente) {
      const { error } = await client.from("scheduled_alerts").update({ status: "cancelled" }).eq("id", pendente.id);
      if (error) throw error;
    }
    return;
  }

  const titulo = `Pneu${tire.position ? ` (${tire.position})` : ""}: só ~${Math.max(kmRestante, 0)} km restantes`;
  const agendadoPara = new Date().toISOString();

  if (pendente) {
    const { error } = await client
      .from("scheduled_alerts")
      .update({ title: titulo, scheduled_for: agendadoPara, vehicle_id: tire.vehicle_id })
      .eq("id", pendente.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from("scheduled_alerts").insert({
    company_id: companyId,
    user_id: userId,
    vehicle_tire_id: tire.id,
    vehicle_id: tire.vehicle_id,
    title: titulo,
    category: "pneu",
    scheduled_for: agendadoPara,
    status: "pending",
  });
  if (error) throw error;
}
