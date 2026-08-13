import type { MaintenanceScheduleRow, VehicleDocumentRow, VehicleDocumentTypeEnum, VehicleRow } from "@/lib/supabase/tables";
import { listVehiclesForPanel } from "./vehicleService";
import { listMaintenanceSchedulesForPanel } from "./maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "./vehicleDocumentService";
import type { SupabaseDbClient } from "./types";

/**
 * Lógica de "vencendo/atrasado" da frota (documentos + manutenções) —
 * extraída de `AlertasClient.tsx` (onde vivia presa a um componente client)
 * para ser reaproveitada por qualquer consumidor: a tela Alertas do painel,
 * um futuro job de disparo, e uma futura ferramenta de consulta via
 * WhatsApp. Puramente derivado — nenhuma tabela própria ainda (ver plano de
 * unificação V1+V2, Fase 5, pra quando isso passar a alimentar
 * `scheduled_alerts`).
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
