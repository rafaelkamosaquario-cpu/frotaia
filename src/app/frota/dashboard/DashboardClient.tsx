"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Truck, Users, Wrench, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { ChecklistDispatchRow, DriverRow, ExpenseRow, MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts } from "@/services/supabase/fleetAlertsService";
import { dispatchesFromToday } from "@/services/supabase/checklistDispatchService";

interface DashboardClientProps {
  veiculos: VehicleRow[];
  motoristas: DriverRow[];
  manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[];
  /** Já vem filtrado aos últimos 30 dias — ver DashboardPage. */
  despesasRecentes: ExpenseRow[];
  checklistDispatches: ChecklistDispatchRow[];
}

const MAX_ALERTAS_PREVIEW = 5;

const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  ok: "OK",
  atencao: "Atenção",
};

const CHECKLIST_STATUS_CLASS: Record<string, string> = {
  pendente: "bg-surface-muted text-muted-foreground",
  ok: "bg-success/10 text-success",
  atencao: "bg-danger/10 text-danger",
};

function formatBRL(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function diasAte(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function DashboardClient({ veiculos, motoristas, manutencoes, documentos, despesasRecentes, checklistDispatches }: DashboardClientProps) {
  const hojeIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = useMemo(() => {
    const veiculosAtivos = veiculos.filter((v) => v.active).length;
    const motoristasAtivos = motoristas.filter((m) => m.active).length;
    const manutencoesPendentes = manutencoes.filter((m) => m.status !== "concluido").length;
    const documentosVencidos = documentos.filter((d) => d.expiry_date && d.expiry_date < hojeIso).length;
    const documentosVencendo = documentos.filter(
      (d) => d.expiry_date && d.expiry_date >= hojeIso && diasAte(d.expiry_date) <= 30
    ).length;
    // Só aparece quando há dado real registrado — nunca número artificial pra preencher layout (ver plano de unificação V1+V2, item Dashboard).
    const custo30Dias = despesasRecentes.length > 0 ? despesasRecentes.reduce((soma, d) => soma + d.amount, 0) : null;

    return [
      { label: "Veículos ativos", value: veiculosAtivos, icon: Truck, color: "primary" as const },
      { label: "Motoristas ativos", value: motoristasAtivos, icon: Users, color: "accent" as const },
      { label: "Manutenções pendentes", value: manutencoesPendentes, icon: Wrench, color: "warning" as const },
      { label: "Documentos vencidos", value: documentosVencidos, icon: AlertTriangle, color: "danger" as const },
      { label: "Vencendo em 30 dias", value: documentosVencendo, icon: Clock, color: "warning" as const },
      { label: "Custo nos últimos 30 dias", value: custo30Dias === null ? "—" : formatBRL(custo30Dias), icon: WalletCards, color: "success" as const },
    ];
  }, [veiculos, motoristas, manutencoes, documentos, despesasRecentes, hojeIso]);

  const alertas = useMemo(() => computeFleetAlerts({ veiculos, manutencoes, documentos }), [veiculos, manutencoes, documentos]);

  const checklistsHoje = useMemo(() => dispatchesFromToday(checklistDispatches), [checklistDispatches]);
  const motoristasPorId = useMemo(() => new Map(motoristas.map((m) => [m.id, m])), [motoristas]);
  const checklistsRespondidos = checklistsHoje.filter((d) => d.response_status !== "pendente").length;
  const checklistPercent = checklistsHoje.length > 0 ? Math.round((checklistsRespondidos / checklistsHoje.length) * 100) : 0;

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da frota</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="flex flex-col gap-3 p-5">
            <div
              className={
                "flex size-11 items-center justify-center rounded-xl " +
                {
                  primary: "bg-primary/10 text-primary",
                  accent: "bg-accent/10 text-accent",
                  warning: "bg-warning/10 text-warning",
                  danger: "bg-danger/10 text-danger",
                  success: "bg-success/10 text-success",
                }[color]
              }
            >
              <Icon className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4.5 text-danger" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Alertas urgentes</h2>
            </div>
            {alertas.length > 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                {alertas.length} pendente{alertas.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta no momento. Tudo em dia por aqui.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {alertas.slice(0, MAX_ALERTAS_PREVIEW).map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface-muted"
                  >
                    <span className={"size-1.5 shrink-0 rounded-full " + (item.vencido ? "bg-danger" : "bg-primary")} aria-hidden />
                    <span className="flex-1 truncate text-foreground">{item.descricao}</span>
                  </Link>
                </li>
              ))}
              {alertas.length > MAX_ALERTAS_PREVIEW && (
                <li>
                  <Link href="/frota/alertas" className="block px-2 pt-1 text-sm font-medium text-primary hover:underline">
                    Ver todos os alertas
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4.5 text-success" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Checklists hoje</h2>
            </div>
            {checklistsHoje.length > 0 && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {checklistsRespondidos}/{checklistsHoje.length} respondidos
              </span>
            )}
          </div>

          {checklistsHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum checklist enviado hoje ainda.</p>
          ) : (
            <>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-success transition-all" style={{ width: `${checklistPercent}%` }} />
              </div>
              <ul className="flex flex-col gap-1">
                {checklistsHoje.map((dispatch) => (
                  <li key={dispatch.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm">
                    {dispatch.response_status === "ok" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <span className={"size-1.5 shrink-0 rounded-full " + (dispatch.response_status === "atencao" ? "bg-danger" : "bg-muted-foreground")} aria-hidden />
                    )}
                    <span className="flex-1 truncate text-foreground">{motoristasPorId.get(dispatch.driver_id)?.name ?? "—"}</span>
                    <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " + CHECKLIST_STATUS_CLASS[dispatch.response_status]}>
                      {CHECKLIST_STATUS_LABEL[dispatch.response_status]}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
