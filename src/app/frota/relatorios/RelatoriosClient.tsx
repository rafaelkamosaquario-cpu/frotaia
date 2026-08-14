"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
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

interface RelatoriosClientProps {
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

const EXPENSE_TYPE_LABEL: Record<ExpenseTypeEnum, string> = {
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

const JOURNEY_STATUS_LABEL: Record<string, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const VEHICLE_TYPE_LABEL: Record<string, string> = {
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

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  tacografo: "Tacógrafo",
  rntrc: "RNTRC",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function contarPor<T>(itens: T[], chave: (item: T) => string): Record<string, number> {
  return itens.reduce<Record<string, number>>((acc, item) => {
    const k = chave(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

interface ResumoBlocoProps {
  titulo: string;
  linhas: { label: string; valor: number }[];
  formatarValor?: (valor: number) => string;
}

function ResumoBloco({ titulo, linhas, formatarValor }: ResumoBlocoProps) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h2>
      <dl className="space-y-1.5">
        {linhas.map(({ label, valor }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{formatarValor ? formatarValor(valor) : valor}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function RelatoriosClient({
  veiculos,
  motoristas,
  manutencoes,
  documentos,
  despesas,
  jornadas,
  checklistDispatches,
  analisesFrete,
}: RelatoriosClientProps) {
  const veiculosPorTipo = useMemo(() => {
    const contagem = contarPor(veiculos, (v) => v.vehicle_type ?? "nao_informado");
    return Object.entries(contagem).map(([tipo, valor]) => ({
      label: tipo === "nao_informado" ? "Não informado" : VEHICLE_TYPE_LABEL[tipo],
      valor,
    }));
  }, [veiculos]);

  const motoristasPorStatus = useMemo(
    () => [
      { label: "Ativos", valor: motoristas.filter((m) => m.active).length },
      { label: "Inativos", valor: motoristas.filter((m) => !m.active).length },
    ],
    [motoristas]
  );

  const documentosPorTipo = useMemo(() => {
    const contagem = contarPor(documentos, (d) => d.document_type);
    return Object.entries(DOCUMENT_TYPE_LABEL).map(([tipo, label]) => ({ label, valor: contagem[tipo] ?? 0 }));
  }, [documentos]);

  const manutencoesPorStatus = useMemo(() => {
    const contagem = contarPor(manutencoes, (m) => m.status);
    return Object.entries(MAINTENANCE_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagem[status] ?? 0 }));
  }, [manutencoes]);

  const custoPorTipoDespesa = useMemo(() => {
    const somaPorTipo = despesas.reduce<Record<string, number>>((acc, d) => {
      acc[d.expense_type] = (acc[d.expense_type] ?? 0) + d.amount;
      return acc;
    }, {});
    return Object.entries(somaPorTipo)
      .map(([tipo, valor]) => ({ label: EXPENSE_TYPE_LABEL[tipo as ExpenseTypeEnum] ?? tipo, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [despesas]);

  const jornadasPorStatus = useMemo(() => {
    const contagem = contarPor(jornadas, (j) => j.status);
    return Object.entries(JOURNEY_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagem[status] ?? 0 }));
  }, [jornadas]);

  const checklistsPorStatus = useMemo(() => {
    const contagem = contarPor(checklistDispatches, (c) => c.response_status);
    return Object.entries(CHECKLIST_STATUS_LABEL).map(([status, label]) => ({ label, valor: contagem[status] ?? 0 }));
  }, [checklistDispatches]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Resumo operacional da frota</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ResumoBloco titulo="Veículos por tipo" linhas={veiculosPorTipo} />
        <ResumoBloco titulo="Motoristas por status" linhas={motoristasPorStatus} />
        <ResumoBloco titulo="Documentos por tipo" linhas={documentosPorTipo} />
        <ResumoBloco titulo="Manutenções por status" linhas={manutencoesPorStatus} />
        {custoPorTipoDespesa.length > 0 && <ResumoBloco titulo="Despesas por tipo (últimos 30 dias)" linhas={custoPorTipoDespesa} formatarValor={formatBRL} />}
        {jornadas.length > 0 && <ResumoBloco titulo="Jornadas por status" linhas={jornadasPorStatus} />}
        {checklistDispatches.length > 0 && <ResumoBloco titulo="Checklists por status" linhas={checklistsPorStatus} />}
        {analisesFrete.length > 0 && <ResumoBloco titulo="Fretes analisados (últimos 30 dias)" linhas={[{ label: "Total de análises", valor: analisesFrete.length }]} />}
      </div>
    </div>
  );
}
