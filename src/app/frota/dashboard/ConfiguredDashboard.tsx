"use client";
import "./fleet-cards.css";
import { useState } from "react";
import Link from "next/link";
import { ProductionGoals, type MonitoringState } from "./ProductionGoals";
import { GroupsOverview } from "./GroupsOverview";
import { FROTA_NAV_ITEMS } from "@/components/frota/frotaNavItems";
import { modulePathAllowed } from "@/lib/frota/companyModules";
import type { VehicleRow, DriverRow } from "@/lib/supabase/tables";
import type { OperationalGroup } from "@/lib/frota/operationalGroups";

export function ConfiguredDashboard({ companyId, enabled, vehicles, drivers, groups, groupsError, canManageGroups }: { companyId: string; enabled: string[]; vehicles: VehicleRow[]; drivers: DriverRow[]; groups: OperationalGroup[]; groupsError: boolean; canManageGroups: boolean }) {
  const [monitoring, setMonitoring] = useState<MonitoringState>({ data: null, loading: true, error: "" });
  const data = !monitoring.loading && !monitoring.error ? monitoring.data : null;
  const money = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return <div className="frota-dashboard space-y-6 p-4 sm:p-6"><header><p className="fleet-eyebrow">PAINEL DA OPERAÇÃO</p><h1 className="text-2xl font-semibold">Sua frota, de perto.</h1><p className="mt-2 text-sm text-muted-foreground">Os módulos preparados para a sua empresa.</p></header>
    <div className="fleet-summary-grid">
      {enabled.includes("frota") && <Link href="/frota/veiculos"><span>Veículos ativos</span><strong>{vehicles.filter(v => v.active).length}</strong><small>{drivers.filter(d => d.active).length} motoristas ativos</small></Link>}
      {enabled.includes("financeiro") && <><Link href="/frota/receitas"><span>Receita registrada</span><strong>{money(data?.revenueSummary?.total)}</strong><small>{data?.month ?? "Carregando período…"}</small></Link><Link href="/frota/despesas"><span>Despesas registradas</span><strong>{money(data?.expenseSummary?.total)}</strong><small>Inclui diesel e remunerações</small></Link><Link href="/frota/resultados" className="fleet-summary-result"><span>Saldo parcial</span><strong>{money(data?.revenueSummary && data?.expenseSummary ? data.revenueSummary.total - data.expenseSummary.total : undefined)}</strong><small>Valores registrados · não é lucro líquido</small></Link></>}
    </div>
    {enabled.includes("grupos") && <GroupsOverview groups={groups} error={groupsError} allowed={canManageGroups} />}
    {enabled.includes("financeiro") && <ProductionGoals companyId={companyId} vehicles={vehicles} drivers={drivers} onSnapshot={setMonitoring} />}
    <section><h2 className="mb-3 text-lg font-semibold">Acessos da operação</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FROTA_NAV_ITEMS.filter(item => item.href !== "/frota/dashboard" && modulePathAllowed(enabled, item.href)).map(item => <Link className="rounded-lg border border-border bg-surface p-4 text-sm hover:border-primary" href={item.href} key={item.href}>{item.label}</Link>)}</div></section>
  </div>;
}
