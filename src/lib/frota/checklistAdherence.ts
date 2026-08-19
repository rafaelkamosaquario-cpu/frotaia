import type { ChecklistDispatchRow, DriverRow } from "@/lib/supabase/tables";
import { estaNaoRespondido } from "@/services/supabase/checklistDispatchService";

/**
 * Aderência ao checklist diário (Checklist V2, B.5) — mesmo espírito de
 * relatoriosAggregation.ts: função pura, sem I/O, reaproveitada pelo
 * painel (B.6), pela ferramenta de IA `consultar_checklist` (B.7) e por
 * Relatórios (B.8), garantindo o mesmo número nos três lugares.
 *
 * Não filtra por período aqui — quem chama já entrega `dispatches` do
 * intervalo desejado (mesmo padrão de listExpenses/relatoriosAggregation,
 * filtro feito na query ao banco, não em memória).
 */

/** Badge visual de baixa aderência (Etapa 18) — só indicador, nunca punição automática. */
export const CHECKLIST_ADERENCIA_BAIXA_LIMIAR = 70;

export interface ChecklistAdherenceByDriver {
  driverId: string;
  driverName: string;
  vehicleId: string | null;
  enviados: number;
  respondidos: number;
  naoRespondidos: number;
  atencao: number;
  aderenciaPercent: number;
}

export interface ChecklistDailySummary {
  enviados: number;
  respondidos: number;
  naoRespondidos: number;
  atencao: number;
}

/** Resumo agregado (sem quebrar por motorista) — usado pelos KPIs do dia (B.6) e no modo HOJE da ferramenta de IA (B.7). */
export function computeChecklistDailySummary(dispatches: ChecklistDispatchRow[]): ChecklistDailySummary {
  return {
    enviados: dispatches.length,
    respondidos: dispatches.filter((d) => d.response_status !== "pendente").length,
    naoRespondidos: dispatches.filter(estaNaoRespondido).length,
    atencao: dispatches.filter((d) => d.response_status === "atencao").length,
  };
}

/**
 * Aderência por motorista no período informado — `aderenciaPercent =
 * respondidos / enviados × 100` (fórmula documentada, Etapa 12). Motorista
 * sem nenhum dispatch no período não aparece (nada a medir).
 */
export function computeChecklistAdherence(dispatches: ChecklistDispatchRow[], drivers: DriverRow[]): ChecklistAdherenceByDriver[] {
  const motoristasPorId = new Map(drivers.map((d) => [d.id, d]));
  const porMotorista = new Map<string, ChecklistDispatchRow[]>();

  for (const dispatch of dispatches) {
    const lista = porMotorista.get(dispatch.driver_id) ?? [];
    lista.push(dispatch);
    porMotorista.set(dispatch.driver_id, lista);
  }

  return Array.from(porMotorista.entries()).map(([driverId, lista]) => {
    const enviados = lista.length;
    const respondidos = lista.filter((d) => d.response_status !== "pendente").length;
    const naoRespondidos = lista.filter(estaNaoRespondido).length;
    const atencao = lista.filter((d) => d.response_status === "atencao").length;
    const vehicleId = lista.find((d) => d.vehicle_id)?.vehicle_id ?? null;

    return {
      driverId,
      driverName: motoristasPorId.get(driverId)?.name ?? "—",
      vehicleId,
      enviados,
      respondidos,
      naoRespondidos,
      atencao,
      aderenciaPercent: enviados > 0 ? Math.round((respondidos / enviados) * 100) : 0,
    };
  });
}
