"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardCheck, FileText, Sparkles, Truck, Users, Wallet, Wrench } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { VehiclePlate } from "@/components/frota/VehiclePlate";
import { ContextualHelp } from "@/components/frota/ContextualHelp";
import type { ChecklistDispatchRow, DriverRow, ExpenseRow, MaintenanceScheduleRow, VehicleDocumentRow, VehicleRow } from "@/lib/supabase/tables";
import { computeFleetAlerts, type FleetAlertItem } from "@/services/supabase/fleetAlertsService";
import { dispatchesFromToday } from "@/services/supabase/checklistDispatchService";

export type CardStyleVariant = "a" | "b";
interface Props {
  veiculos: VehicleRow[]; motoristas: DriverRow[]; manutencoes: MaintenanceScheduleRow[];
  documentos: VehicleDocumentRow[]; despesasRecentes: ExpenseRow[]; checklistDispatches: ChecklistDispatchRow[];
  insight: string | null; cardStyle: CardStyleVariant;
}
function diasAte(iso: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoje.getTime()) / 86_400_000);
}
function AlertSection({ title, items, href, empty }: { title: string; items: FleetAlertItem[]; href: string; empty: string }) {
  return <Card className="p-4 sm:p-5">
    <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2><Link href={href} className="shrink-0 py-2 text-sm font-medium text-primary">Ver todos<span className="sr-only">: {title}</span></Link></div>
    {!items.length ? <p className="text-sm leading-relaxed text-muted-foreground">{empty}</p> : <ul className="divide-y divide-border">{items.slice(0, 3).map(item => <li key={item.id}>
      <Link href={item.href} className="flex items-start gap-3 rounded-md py-3 hover:bg-surface-muted">
        <span className="min-w-0 flex-1 text-sm leading-relaxed">{item.descricao}</span>
        <span className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-medium", item.vencido ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning")}>{item.vencido ? "Vencido" : "Atenção"}</span>
      </Link></li>)}</ul>}
  </Card>;
}

/** Apresentação apenas: mantém as fontes e as regras dos indicadores anteriores. */
export function DashboardClient({ veiculos, motoristas, manutencoes, documentos, despesasRecentes, checklistDispatches, insight }: Props) {
  const hojeIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ativos = veiculos.filter(v => v.active).length;
  const motoristasAtivos = motoristas.filter(m => m.active).length;
  const pendentes = manutencoes.filter(m => m.status !== "concluido").length;
  const vencidos = documentos.filter(d => d.expiry_date && d.expiry_date < hojeIso).length;
  const vencendo = documentos.filter(d => d.expiry_date && d.expiry_date >= hojeIso && diasAte(d.expiry_date) <= 30).length;
  const custo = despesasRecentes.length ? despesasRecentes.reduce((sum, d) => sum + d.amount, 0) : null;
  const kpis = [
    { label: "Veículos ativos", value: ativos, context: `${veiculos.length} ${veiculos.length === 1 ? "veículo cadastrado" : "veículos cadastrados"}`, Icon: Truck, href: "/frota/veiculos", tone: "text-primary" },
    { label: "Motoristas ativos", value: motoristasAtivos, context: `${motoristas.length} ${motoristas.length === 1 ? "motorista cadastrado" : "motoristas cadastrados"}`, Icon: Users, href: "/frota/motoristas", tone: "text-primary" },
    { label: "Manutenções pendentes", value: pendentes, context: pendentes ? "Acompanhe os serviços" : "Nenhum serviço pendente", Icon: Wrench, href: "/frota/manutencao", tone: pendentes ? "text-warning" : "text-primary" },
    { label: "Documentos vencidos", value: vencidos, context: vencidos ? "Requer atenção" : "Nenhum vencimento em atraso", Icon: FileText, href: "/frota/documentos", tone: vencidos ? "text-danger" : "text-primary" },
    { label: "Vencendo em 30 dias", value: vencendo, context: "Documentos da frota", Icon: CalendarClock, href: "/frota/documentos", tone: vencendo ? "text-warning" : "text-primary" },
    { label: "Custo nos últimos 30 dias", value: custo === null ? "—" : custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " "), context: custo === null ? "Sem despesas registradas no período" : "Em despesas registradas", Icon: Wallet, href: "/frota/despesas", tone: "text-primary", currency: true },
  ];
  const alertas = useMemo(() => computeFleetAlerts({ veiculos, manutencoes, documentos }), [veiculos, manutencoes, documentos]);
  const hoje = useMemo(() => dispatchesFromToday(checklistDispatches), [checklistDispatches]);
  const respondidos = hoje.filter(d => d.response_status !== "pendente").length;
  const drivers = new Map(motoristas.map(m => [m.id, m.name]));
  const recentes = [...veiculos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);

  return <div className="frota-dashboard flex flex-1 flex-col">
    <div className="flex items-start justify-between gap-3"><div><h1>Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Visão geral da frota</p></div><ContextualHelp topic="dashboard" /></div>
    <Card data-tour="ia-sugere" className="dashboard-insight flex flex-wrap items-start gap-3 sm:gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Sparkles className="size-6" aria-hidden /></span>
      <div className="min-w-0 flex-1 basis-48"><h2 className="text-base font-semibold">Frota IA informa</h2><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{insight || "O resumo da IA ainda não está disponível. Consulte os indicadores ou pergunte ao Frota IA sobre sua frota."}</p></div>
      <Link href="/frota/alertas" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Ver pendências<ArrowRight className="size-4" aria-hidden /></Link>
    </Card>
    <div data-tour="kpis" className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {kpis.map(({ label, value, context, Icon, href, tone, currency }) => <Link key={label} href={href} className="dashboard-kpi ui-card min-w-0 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/60 sm:p-5">
        <div className="mb-3 flex items-start gap-2.5"><Icon className={cn("size-6 shrink-0 sm:size-7", tone)} aria-hidden /><h2 className="text-sm font-medium leading-snug">{label}</h2></div>
        <p className={cn("dashboard-kpi-value font-bold tracking-tight tabular-nums", currency ? "dashboard-currency" : "text-3xl sm:text-4xl")}>{value}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{context}</p>
      </Link>)}
    </div>
    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="min-w-0 overflow-hidden p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Veículos da frota</h2><Link href="/frota/veiculos" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Ver veículos<ArrowRight className="size-4" aria-hidden /></Link></div>
        {!recentes.length ? <p className="py-6 text-sm text-muted-foreground">Nenhum veículo cadastrado. Acesse Veículos para adicionar o primeiro.</p> : <table className="dashboard-vehicles w-full text-left text-sm">
          <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 font-medium">Placa</th><th className="pb-3 font-medium">Veículo</th><th className="pb-3 font-medium">Status</th><th className="pb-3 text-right font-medium">KM informado</th></tr></thead>
          <tbody>{recentes.map(v => <tr key={v.id} className="border-b border-border last:border-0">
            <td className="py-4 pr-3"><VehiclePlate plate={v.plate} /></td>
            <td className="py-4 pr-3"><span className="font-medium">{[v.brand, v.model].filter(Boolean).join(" ") || v.name || "Veículo sem identificação"}</span>{v.model && v.name && <span className="mt-1 block text-xs text-muted-foreground">{v.name}</span>}</td>
            <td className="py-4 pr-3"><span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", v.active ? "text-success" : "text-muted-foreground")}><span className="size-1.5 rounded-full bg-current" aria-hidden />{v.active ? "Ativo" : "Inativo"}</span></td>
            <td className="py-4 text-right tabular-nums text-muted-foreground">{v.current_odometer_km === null ? "Não informado" : `${v.current_odometer_km.toLocaleString("pt-BR")} km`}</td>
          </tr>)}</tbody>
        </table>}
      </Card>
      <div className="grid gap-5">
        <AlertSection title="Documentos — atenção" href="/frota/documentos" items={alertas.filter(a => a.id.startsWith("doc-"))} empty="Nenhum documento vencido ou vencendo nos próximos 30 dias." />
        <AlertSection title="Manutenções — atenção" href="/frota/manutencao" items={alertas.filter(a => a.id.startsWith("man-"))} empty="Nenhum alerta de manutenção por data nos próximos 30 dias." />
        <Card className="p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold"><ClipboardCheck className="size-5 text-primary" aria-hidden />Checklists hoje</h2><Link href="/frota/checklists" className="py-2 text-sm text-primary">Ver todos</Link></div>
          {!hoje.length ? <p className="text-sm text-muted-foreground">Nenhum checklist enviado hoje.</p> : <><p className="mb-3 text-sm text-muted-foreground">{respondidos} de {hoje.length} respondidos</p><ul className="space-y-2">{hoje.map(d => <li key={d.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{drivers.get(d.driver_id) ?? "Motorista não identificado"}</span><span className={cn("shrink-0", d.response_status === "ok" ? "text-success" : d.response_status === "atencao" ? "text-danger" : "text-muted-foreground")}>{d.response_status === "ok" ? "OK" : d.response_status === "atencao" ? "Atenção" : "Pendente"}</span></li>)}</ul></>}
        </Card>
      </div>
    </div>
  </div>;
}
