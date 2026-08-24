import type {
  AnalysisRunRow,
  ChecklistDispatchRow,
  DriverRow,
  ExpenseRow,
  ExpenseTypeEnum,
  MaintenanceScheduleRow,
  SavedJourneyRow,
  VehicleDocumentRow,
  VehicleRow,
} from "@/lib/supabase/tables";
import { computeChecklistAdherence } from "./checklistAdherence";

/**
 * Agregações da tela Relatórios — extraído de RelatoriosClient.tsx pra ser
 * reaproveitado também pelo export em PDF (src/app/api/frota/relatorios/pdf),
 * sem duplicar a lógica de contagem em dois lugares.
 */

export const EXPENSE_TYPE_LABEL: Record<ExpenseTypeEnum, string> = {
  combustivel: "Combustível",
  manutencao: "Manutenção",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  hospedagem: "Hospedagem",
  documentacao: "Documentação",
  pneu: "Pneu",
  seguro: "Seguro",
  multa: "Multa",
  outro: "Outro",
};

export const JOURNEY_STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  utilitario: "Utilitário",
  tres_quartos: "3/4",
  toco: "Toco",
  truck: "Truck",
  cavalo_mecanico: "Cavalo mecânico",
  carreta: "Carreta",
  bitrem: "Bitrem",
  rodotrem: "Rodotrem",
  onibus: "Ônibus",
  outro: "Outro",
};

export const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  tacografo: "Tacógrafo",
  rntrc: "RNTRC",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

export const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export function contarPor<T>(itens: T[], chave: (item: T) => string): Record<string, number> {
  return itens.reduce<Record<string, number>>((acc, item) => {
    const k = chave(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

export interface RelatoriosBloco {
  titulo: string;
  linhas: { label: string; valor: number }[];
  formatarValor?: (valor: number) => string;
}

export interface RelatoriosInput {
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
  /** Sem filtro — a filtragem por período/veículo/motorista acontece via filterRelatoriosInput. */
  despesas: ExpenseRow[];
  jornadas: SavedJourneyRow[];
  checklistDispatches: ChecklistDispatchRow[];
  /** Já vem filtrado a analysis_type='analisar_frete' na query — ver RelatoriosPage. */
  analisesFrete: AnalysisRunRow[];
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type PeriodoPreset = "7d" | "30d" | "90d" | "mes_atual" | "mes_anterior" | "custom";

export const PERIODO_PRESET_LABEL: Record<PeriodoPreset, string> = {
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  "90d": "últimos 90 dias",
  mes_atual: "mês atual",
  mes_anterior: "mês anterior",
  custom: "período personalizado",
};

function toIsoDate(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Única fonte de verdade do cálculo de período — usada pela tela e pelo PDF, garante que os dois nunca divirjam. `agora` é injetável só pra teste. */
export function resolvePeriodo(
  params: { period?: string; from?: string; to?: string },
  agora: Date = new Date()
): { from: string; to: string; label: string; preset: PeriodoPreset } {
  const preset: PeriodoPreset = (["7d", "30d", "90d", "mes_atual", "mes_anterior", "custom"] as const).includes(params.period as PeriodoPreset)
    ? (params.period as PeriodoPreset)
    : "30d";

  if (preset === "custom" && params.from && params.to) {
    return { from: params.from, to: params.to, label: `${formatarDataCurta(params.from)} a ${formatarDataCurta(params.to)}`, preset };
  }

  const hoje = toIsoDate(agora);
  if (preset === "mes_atual") {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    return { from: toIsoDate(inicio), to: hoje, label: PERIODO_PRESET_LABEL.mes_atual, preset };
  }
  if (preset === "mes_anterior") {
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth(), 0);
    return { from: toIsoDate(inicio), to: toIsoDate(fim), label: PERIODO_PRESET_LABEL.mes_anterior, preset };
  }

  const dias = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - dias);
  return { from: toIsoDate(inicio), to: hoje, label: PERIODO_PRESET_LABEL[preset], preset };
}

function formatarDataCurta(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export interface RelatoriosFiltro {
  /** YYYY-MM-DD, ambos opcionais — sem os dois, nenhum recorte de período é aplicado. */
  from?: string;
  to?: string;
  vehicleId?: string;
  driverId?: string;
}

/** Sem data (ex.: documento sem vencimento) nunca é excluído por filtro de período — esconder dado real seria pior que mostrá-lo fora do recorte. */
function dentroDoPeriodo(dataIso: string | null | undefined, from?: string, to?: string): boolean {
  if (!from && !to) return true;
  if (!dataIso) return true;
  const data = dataIso.slice(0, 10);
  if (from && data < from) return false;
  if (to && data > to) return false;
  return true;
}

/**
 * Filtro real de período/veículo/motorista pra Relatórios (evolução funcional
 * 08/2026). Aplicado só onde a relação genuinely existe em cada tabela —
 * nunca finge uma relação que não existe (ex.: despesas não tem driver_id,
 * então filtro de motorista nunca reduz o bloco de despesas; veículos/
 * motoristas em si não têm data, então filtro de período nunca os reduz).
 */
export function filterRelatoriosInput(input: RelatoriosInput, filtro: RelatoriosFiltro): RelatoriosInput {
  const { from, to, vehicleId, driverId } = filtro;

  return {
    veiculos: vehicleId ? input.veiculos.filter((v) => v.id === vehicleId) : input.veiculos,
    motoristas: driverId
      ? input.motoristas.filter((m) => m.id === driverId)
      : vehicleId
        ? input.motoristas.filter((m) => m.vehicle_id === vehicleId)
        : input.motoristas,
    manutencoes: input.manutencoes.filter((m) => (!vehicleId || m.vehicle_id === vehicleId) && dentroDoPeriodo(m.due_date, from, to)),
    documentos: input.documentos.filter(
      (d) => (!vehicleId || d.vehicle_id === vehicleId) && (!driverId || d.driver_id === driverId) && dentroDoPeriodo(d.expiry_date, from, to)
    ),
    despesas: input.despesas.filter((d) => (!vehicleId || d.vehicle_id === vehicleId) && dentroDoPeriodo(d.expense_date, from, to)),
    jornadas: input.jornadas.filter(
      (j) => (!vehicleId || j.vehicle_id === vehicleId) && (!driverId || j.driver_id === driverId) && dentroDoPeriodo(j.scheduled_departure, from, to)
    ),
    checklistDispatches: input.checklistDispatches.filter(
      (c) => (!vehicleId || c.vehicle_id === vehicleId) && (!driverId || c.driver_id === driverId) && dentroDoPeriodo(c.sent_at, from, to)
    ),
    // Motorista não filtra fretes analisados (analysis_runs não tem relação com motorista). dateFrom já vem aplicado na query
    // (listAnalysisRuns não tem dateTo/vehicleId) — o "to" e o veículo são sempre resolvidos aqui, em memória.
    analisesFrete: input.analisesFrete.filter((a) => (!vehicleId || a.vehicle_id === vehicleId) && dentroDoPeriodo(a.created_at, undefined, to)),
  };
}

/** Só inclui blocos condicionais (despesas/jornadas/checklists/fretes) quando há dado — mesmo critério da tela. periodoLabel entra só no título dos blocos que já eram period-scoped (despesas/fretes) — default preserva o texto de antes. */
export function computeRelatoriosBlocos(input: RelatoriosInput, periodoLabel = "últimos 30 dias"): RelatoriosBloco[] {
  const veiculosPorTipo = Object.entries(contarPor(input.veiculos, (v) => v.vehicle_type ?? "nao_informado")).map(([tipo, valor]) => ({
    label: tipo === "nao_informado" ? "Não informado" : VEHICLE_TYPE_LABEL[tipo],
    valor,
  }));

  const motoristasPorStatus = [
    { label: "Ativos", valor: input.motoristas.filter((m) => m.active).length },
    { label: "Inativos", valor: input.motoristas.filter((m) => !m.active).length },
  ];

  const contagemDocumentos = contarPor(input.documentos, (d) => d.document_type);
  const documentosPorTipo = Object.entries(DOCUMENT_TYPE_LABEL).map(([tipo, label]) => ({ label, valor: contagemDocumentos[tipo] ?? 0 }));

  const contagemManutencoes = contarPor(input.manutencoes, (m) => m.status);
  const manutencoesPorStatus = Object.entries(MAINTENANCE_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagemManutencoes[status] ?? 0 }));

  const somaPorTipoDespesa = input.despesas.reduce<Record<string, number>>((acc, d) => {
    acc[d.expense_type] = (acc[d.expense_type] ?? 0) + d.amount;
    return acc;
  }, {});
  const custoPorTipoDespesa = Object.entries(somaPorTipoDespesa)
    .map(([tipo, valor]) => ({ label: EXPENSE_TYPE_LABEL[tipo as ExpenseTypeEnum] ?? tipo, valor }))
    .sort((a, b) => b.valor - a.valor);

  const contagemJornadas = contarPor(input.jornadas, (j) => j.status);
  const jornadasPorStatus = Object.entries(JOURNEY_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagemJornadas[status] ?? 0 }));

  const contagemChecklists = contarPor(input.checklistDispatches, (c) => c.response_status);
  const checklistsPorStatus = Object.entries(CHECKLIST_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagemChecklists[status] ?? 0 }));

  const aderenciaPorMotorista = computeChecklistAdherence(input.checklistDispatches, input.motoristas);
  const aderenciaMedia =
    aderenciaPorMotorista.length > 0
      ? Math.round(aderenciaPorMotorista.reduce((soma, m) => soma + m.aderenciaPercent, 0) / aderenciaPorMotorista.length)
      : 0;
  const pioresAderencias = [...aderenciaPorMotorista].sort((a, b) => a.aderenciaPercent - b.aderenciaPercent).slice(0, 3);

  const blocos: RelatoriosBloco[] = [
    { titulo: "Veículos por tipo", linhas: veiculosPorTipo },
    { titulo: "Motoristas por status", linhas: motoristasPorStatus },
    { titulo: "Documentos por tipo", linhas: documentosPorTipo },
    { titulo: "Manutenções por status", linhas: manutencoesPorStatus },
  ];

  if (input.despesas.length > 0) blocos.push({ titulo: `Despesas por tipo (${periodoLabel})`, linhas: custoPorTipoDespesa, formatarValor: formatBRL });
  if (input.jornadas.length > 0) blocos.push({ titulo: "Jornadas por status", linhas: jornadasPorStatus });
  if (input.checklistDispatches.length > 0) {
    blocos.push({ titulo: "Checklists por status", linhas: checklistsPorStatus });
    blocos.push({
      // Sem recorte de data — checklistDispatches chega sem filtro de período (mesmo escopo do bloco "Checklists por status" acima).
      titulo: "Aderência ao checklist",
      linhas: [
        { label: "Aderência média", valor: aderenciaMedia },
        ...pioresAderencias.map((m, i) => ({ label: `${i + 1}º menor aderência: ${m.driverName}`, valor: m.aderenciaPercent })),
      ],
      formatarValor: (v) => `${v}%`,
    });
  }
  if (input.analisesFrete.length > 0) {
    blocos.push({ titulo: `Fretes analisados (${periodoLabel})`, linhas: [{ label: "Total de análises", valor: input.analisesFrete.length }] });
  }

  return blocos;
}
