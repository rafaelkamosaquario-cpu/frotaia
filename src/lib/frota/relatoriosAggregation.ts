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
  /** Já vem filtrado aos últimos 30 dias — ver RelatoriosPage. */
  despesas: ExpenseRow[];
  jornadas: SavedJourneyRow[];
  checklistDispatches: ChecklistDispatchRow[];
  /** Já vem filtrado a analysis_type='analisar_frete' — ver RelatoriosPage. */
  analisesFrete: AnalysisRunRow[];
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Só inclui blocos condicionais (despesas/jornadas/checklists/fretes) quando há dado — mesmo critério da tela. */
export function computeRelatoriosBlocos(input: RelatoriosInput): RelatoriosBloco[] {
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

  if (input.despesas.length > 0) blocos.push({ titulo: "Despesas por tipo (últimos 30 dias)", linhas: custoPorTipoDespesa, formatarValor: formatBRL });
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
    blocos.push({ titulo: "Fretes analisados (últimos 30 dias)", linhas: [{ label: "Total de análises", valor: input.analisesFrete.length }] });
  }

  return blocos;
}
