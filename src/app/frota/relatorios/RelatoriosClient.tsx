"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import type {
  DriverRow,
  MaintenanceScheduleRow,
  VehicleDocumentRow,
  VehicleRow,
} from "@/lib/supabase/tables";

interface RelatoriosClientProps {
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
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
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  concluido: "Concluído",
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
}

function ResumoBloco({ titulo, linhas }: ResumoBlocoProps) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h2>
      <dl className="space-y-1.5">
        {linhas.map(({ label, valor }) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium text-foreground">{valor}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function RelatoriosClient({ veiculos, motoristas, manutencoes, documentos }: RelatoriosClientProps) {
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
      </div>
    </div>
  );
}
