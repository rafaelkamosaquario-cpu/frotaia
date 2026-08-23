"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Bell } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MaintenanceScheduleRow, ScheduledAlertRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts } from "@/services/supabase/fleetAlertsService";

interface AlertasClientProps {
  veiculos: VehicleRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
  /** Lembretes "livres" criados via gerenciar_alerta no WhatsApp (sem vínculo a veículo/manutenção/documento) — ver comentário em page.tsx. */
  lembretes: ScheduledAlertRow[];
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function AlertasClient({ veiculos, manutencoes, documentos, lembretes }: AlertasClientProps) {
  const itens = useMemo(
    () => computeFleetAlerts({ veiculos, manutencoes, documentos }),
    [veiculos, manutencoes, documentos]
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Alertas</h1>
        <p className="text-sm text-muted-foreground">Documentos e manutenções vencidos ou vencendo nos próximos 30 dias</p>
      </div>

      {itens.length === 0 ? (
        <Card className="p-2">
          <EmptyState icon={AlertTriangle} title="Nenhum alerta no momento" description="Tudo em dia por aqui." />
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="frota-table w-full min-w-[560px] border-collapse text-sm">
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
                  <td data-label="Item" className="px-4 py-3 text-foreground">{item.descricao}</td>
                  <td data-label="Data" className="px-4 py-3 text-muted-foreground">{formatDate(item.data)}</td>
                  <td data-label="Urgência" className="px-4 py-3">
                    <span
                      className={
                        item.vencido
                          ? "rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
                          : "rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                      }
                    >
                      {item.vencido ? "Vencido" : "Vencendo"}
                    </span>
                  </td>
                  <td data-label="Ver" className="px-4 py-3 text-right">
                    <Link href={item.href} className="text-sm font-medium text-accent hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          Lembretes pelo WhatsApp
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Avisos agendados pelo cliente na conversa (ex.: &ldquo;me avise 10 dias antes de vencer&rdquo;) — enviados no horário marcado, independente do veículo/documento.</p>
        {lembretes.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">Nenhum lembrete agendado.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="frota-table w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Título</th>
                  <th className="px-4 py-3 font-medium">Quando</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {lembretes.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td data-label="Título" className="px-4 py-3 text-foreground">{l.title}</td>
                    <td data-label="Quando" className="px-4 py-3 text-muted-foreground">{formatDateTime(l.scheduled_for)}</td>
                    <td data-label="Categoria" className="px-4 py-3 text-muted-foreground">{l.category ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
