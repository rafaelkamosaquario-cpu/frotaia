"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts } from "@/services/supabase/fleetAlertsService";

interface AlertasClientProps {
  veiculos: VehicleRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

export function AlertasClient({ veiculos, manutencoes, documentos }: AlertasClientProps) {
  const itens = useMemo(
    () => computeFleetAlerts({ veiculos, manutencoes, documentos }),
    [veiculos, manutencoes, documentos]
  );

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
