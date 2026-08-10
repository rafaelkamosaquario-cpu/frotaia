"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  MaintenanceScheduleRow,
  VehicleDocumentRow,
  VehicleDocumentTypeEnum,
  VehicleRow,
} from "@/lib/supabase/tables";

interface AlertasClientProps {
  veiculos: VehicleRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
}

interface AlertItem {
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
  cnh: "CNH",
  toxicologico: "Toxicológico",
};

const LIMITE_DIAS = 30;

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function descricaoUrgencia(dias: number): string {
  if (dias < 0) return `vencido há ${Math.abs(dias)} dia(s)`;
  if (dias === 0) return "vence hoje";
  return `vence em ${dias} dia(s)`;
}

export function AlertasClient({ veiculos, manutencoes, documentos }: AlertasClientProps) {
  const veiculosPorId = useMemo(() => new Map(veiculos.map((v) => [v.id, v])), [veiculos]);

  const itens = useMemo<AlertItem[]>(() => {
    const deDocumentos: AlertItem[] = documentos
      .filter((d): d is VehicleDocumentRow & { expiry_date: string } => !!d.expiry_date && diasAte(d.expiry_date) <= LIMITE_DIAS)
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

    const deManutencoes: AlertItem[] = manutencoes
      .filter((m) => m.status !== "concluido" && diasAte(m.due_date) <= LIMITE_DIAS)
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
  }, [documentos, manutencoes, veiculosPorId]);

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Alertas</h1>
        <p className="text-sm text-muted-foreground">Documentos e manutenções vencidos ou vencendo nos próximos 30 dias</p>
      </div>

      {itens.length === 0 ? (
        <Card className="p-2">
          <EmptyState icon={AlertTriangle} title="Nenhum alerta no momento" description="Tudo em dia por aqui." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Urgência</th>
                <th className="px-4 py-3 font-medium text-right">Ver</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                  <td className="px-4 py-3 text-foreground">{item.descricao}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(item.data)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        item.vencido
                          ? "rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
                          : "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      }
                    >
                      {item.vencido ? "Vencido" : "Vencendo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={item.href} className="text-sm font-medium text-primary hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
