"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { VehicleRow } from "@/lib/supabase/tables";
import { goalProgress, type MonthlyProduction, type ProductionInput } from "@/lib/frota/productionGoals";
import type { ProductionRevenue } from "@/lib/frota/productionRevenue";
import Link from "next/link";
import type { MonthlyExpenses } from "@/lib/frota/monthlyExpenses";
import type { MonthlySnapshot } from "@/lib/frota/monthlyMonitoring";

type Loaded = { month: string; today: string; rows: MonthlyProduction[]; canEdit: boolean; revenueSummary: ProductionRevenue | null; revenueError: string | null; expenseSummary: MonthlyExpenses | null; expenseError: string | null; checkedAt?: string; payrollDue?: {date:string;amount:number}[] | null };
export type MonitoringState = { data: MonthlySnapshot | null; loading: boolean; error: string };
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const tonnes = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const field = "mt-1 w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const tones = { neutral: "text-muted-foreground", success: "text-success", danger: "text-danger", warning: "text-warning" };

export function ProductionGoals({ vehicles, onSnapshot }: { vehicles: VehicleRow[]; onSnapshot?: (state: MonitoringState) => void }) {
  const [month, setMonth] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/frota/metas${month ? `?month=${month}` : ""}`, { signal: abort.signal, cache: "no-store" })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error); return body as Loaded; })
      .then(body => { setLoaded(body); setError(""); setLoading(false); })
      .catch(e => { if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "Não foi possível carregar."); setLoading(false); } });
    return () => abort.abort();
  }, [month, reload]);
  useEffect(() => { onSnapshot?.({ data: loaded, loading, error }); }, [loaded, loading, error, onSnapshot]);
  const refresh = () => { setLoading(true); setEditing(false); setReload(r => r + 1); };
  const rows = loaded?.rows ?? [];
  const transport = rows.filter(r => r.operation === "transporte");
  const targets = transport.filter(r => r.target_tonnes !== null);
  const target = targets.reduce((s, r) => s + (r.target_tonnes ?? 0), 0);
  const actual = targets.reduce((s, r) => s + (r.actual_tonnes ?? 0), 0);
  const absent = targets.filter(r => r.actual_tonnes === null).length;
  const reached = targets.filter(r => r.actual_tonnes !== null && r.actual_tonnes >= r.target_tonnes!).length;
  const vehicleName = (id: string) => { const v = vehicles.find(v => v.id === id); return v ? `${v.plate} · ${v.name || [v.brand, v.model].filter(Boolean).join(" ")}` : "Veículo indisponível"; };
  const renderRow = (r: MonthlyProduction) => {
    const progress = goalProgress(r, loaded!.today);
    const revenue = loaded?.revenueSummary?.byVehicle[r.vehicle_id];
    const expenses = loaded?.expenseSummary?.byVehicle[r.vehicle_id];
    return <article key={r.vehicle_id} className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{vehicleName(r.vehicle_id)}</h3><span className={`text-sm font-medium ${tones[progress.tone]}`}>{progress.label}</span></div>
      <p className="mt-3 text-lg font-semibold tabular-nums">{r.actual_tonnes === null ? "Produção não informada" : `${tonnes(r.actual_tonnes)} t`}<span className="text-sm font-normal text-muted-foreground">{r.target_tonnes ? ` / meta ${tonnes(r.target_tonnes)} t` : " · sem meta definida"}</span></p>
      <p className="mt-2 text-sm">Receita registrada no mês: <strong className="tabular-nums text-primary">{loaded?.revenueSummary ? revenue ? money(revenue.amount) : "Sem lançamento" : "Indisponível"}</strong></p>
      {loaded?.expenseSummary && <p className="mt-2 text-sm">Combustível: <strong>{money(expenses?.fuel ?? 0)}</strong> · Remunerações: <strong>{money(expenses?.payroll ?? 0)}</strong> · Outras despesas: <strong>{money(expenses?.other ?? 0)}</strong></p>}
      {loaded?.expenseSummary && loaded.revenueSummary && <p className="mt-2 text-sm">Saldo parcial registrado: <strong>{money((Math.round((revenue?.amount ?? 0) * 100) - Math.round((expenses?.total ?? 0) * 100)) / 100)}</strong></p>}
      {progress.percent !== null && <><div role="progressbar" aria-label={`Meta de ${vehicleName(r.vehicle_id)}`} aria-valuenow={Math.min(100, progress.percent)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress.percent.toFixed(1)}% da meta`} className="my-2 h-2 overflow-hidden rounded-full bg-surface-muted"><div className={`${progress.tone === "danger" ? "bg-danger" : progress.tone === "warning" ? "bg-warning" : "bg-success"} h-full`} style={{ width: `${Math.min(100, progress.percent)}%` }} /></div><p className="text-sm tabular-nums">{progress.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta · faltam {tonnes(progress.missing ?? 0)} t</p></>}
      <p className="mt-2 text-xs text-muted-foreground">{r.measured_through ? `Apurado até ${r.measured_through.split("-").reverse().join("/")}` : "Aguardando apuração"}{r.diesel_liters !== null ? ` · ${r.diesel_liters.toLocaleString("pt-BR")} L de diesel` : ""}{r.actual_tonnes !== null && r.actual_tonnes > 0 && r.diesel_liters !== null ? ` · ${tonnes(r.diesel_liters / r.actual_tonnes)} L/t` : ""}</p>
      {r.note && <p className="mt-2 text-xs text-muted-foreground">{r.note}</p>}
    </article>;
  };
  return <Card className="mt-5 p-4 sm:p-5" id="metas-producao">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Resultado, produção e metas do mês</h2><p className="mt-1 text-sm text-muted-foreground">Receitas, combustível e remunerações no mesmo período</p></div><label className="text-sm">Mês de referência<input type="month" min="2000-01" max="2099-12" aria-label="Mês do resultado e das metas" className={field} value={month || loaded?.month || ""} onChange={e => { if (e.target.value) { setLoading(true); setEditing(false); setMonth(e.target.value); } }} /></label><Button variant="outline" onClick={refresh} disabled={loading}>Atualizar acompanhamento</Button></div>
    {loading ? <p role="status" className="py-5 text-sm">Carregando metas...</p> : error ? <div role="alert" className="py-4"><p>{error}</p><Button onClick={refresh} variant="outline" className="mt-2">Tentar novamente</Button></div> : loaded && <>
      <p className="mt-3 text-xs text-muted-foreground">Ao abrir, exibimos o último mês com produção informada. O ritmo parcial é proporcional aos dias corridos até a data da apuração, não uma previsão de lucro.</p>
      {loaded.revenueError && <div role="alert" className="mt-4 rounded-lg border border-warning p-3 text-sm"><p>{loaded.revenueError}</p><Button variant="outline" onClick={refresh} className="mt-2">Atualizar receitas</Button></div>}
      {loaded.revenueSummary && <section aria-label="Receitas registradas no mês" className="mt-4">
        <div className="grid gap-3 sm:grid-cols-3">{[
          { label: "Receita de transporte", value: loaded.revenueSummary.transport, detail: "Veículos classificados como transporte no mês" },
          { label: "Receita de carregamento", value: loaded.revenueSummary.loading, detail: "Veículos classificados como carregamento no mês" },
          { label: "Receita total registrada", value: loaded.revenueSummary.total, detail: `${loaded.revenueSummary.count} lançamento(s) no mês selecionado` },
        ].map(item => <div key={item.label} className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-medium">{item.label}</h3><p className="mt-2 break-words text-xl font-bold tabular-nums text-primary sm:text-2xl">{money(item.value)}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p></div>)}</div>
        {loaded.revenueSummary.other !== 0 && <p className="mt-2 text-sm">Outras receitas / veículos sem classificação no mês: <strong>{money(loaded.revenueSummary.other)}</strong>. Incluídas no total.</p>}
        {!loaded.revenueSummary.count && <p className="mt-2 text-sm text-muted-foreground">Nenhuma receita lançada neste mês.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Fonte: lançamentos existentes em Receitas, pela data da receita. Os valores não comprovam recebimento e não representam lucro. A separação por operação segue a classificação mensal do veículo; não é calculada novamente pelas toneladas.</p>
      </section>}
      {loaded.expenseError && <div role="alert" className="mt-4 rounded-lg border border-warning p-3 text-sm"><p>{loaded.expenseError}</p><Button variant="outline" onClick={refresh} className="mt-2">Atualizar despesas</Button></div>}
      {loaded.expenseSummary && <section aria-label="Despesas e saldo do mês" className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          { label: "Combustível / diesel", value: loaded.expenseSummary.fuel, href: "/frota/abastecimentos" },
          { label: "Salários e remunerações", value: loaded.expenseSummary.payroll, href: "/frota/custos" },
          { label: "Outras despesas", value: loaded.expenseSummary.other, href: "/frota/despesas" },
          { label: "Despesas totais", value: loaded.expenseSummary.total, href: "/frota/despesas" },
        ].map(item => <Link href={item.href} key={item.label} className="rounded-xl border border-border p-4 hover:border-primary"><h3 className="text-sm font-medium">{item.label}</h3><p className="mt-2 text-xl font-bold tabular-nums">{money(item.value)}</p></Link>)}</div>
        {loaded.revenueSummary && <div className="mt-3 rounded-xl bg-surface-muted p-4"><h3 className="font-semibold">Saldo parcial do mês</h3><p className={`mt-2 text-2xl font-bold tabular-nums ${loaded.revenueSummary.total < loaded.expenseSummary.total ? "text-danger" : "text-success"}`}>{money((Math.round(loaded.revenueSummary.total * 100) - Math.round(loaded.expenseSummary.total * 100)) / 100)}</p><p className="mt-1 text-xs text-muted-foreground">Receitas registradas menos todas as despesas registradas no mês. Não é saldo bancário nem lucro líquido: depende de todos os custos terem sido informados.</p></div>}
        <p className="mt-2 text-xs text-muted-foreground">Despesas pela data do lançamento, do primeiro ao último dia do mês selecionado. Salários e pró-labore confirmados em Custos e remunerações entram uma única vez pela despesa vinculada, mesmo com pagamento previsto para outro mês. Regras ainda não confirmadas não entram. Os valores não comprovam pagamento.</p>
      </section>}
      {targets.length > 0 && <div className="my-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-primary/10 p-3"><p className="text-xs">Transporte com meta</p><p className="text-xl font-semibold">{tonnes(actual)} t</p><p className="text-xs">Meta total: {tonnes(target)} t {absent ? `· dados incompletos (${absent} sem apuração)` : ""}</p></div>
        <div className="rounded-lg bg-surface-muted p-3"><p className="text-xs">Realização{absent ? " parcial" : ""}</p><p className="text-xl font-semibold">{(actual / target * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</p><p className="text-xs">Dos totais registrados nos veículos com meta</p></div>
        <div className="rounded-lg bg-surface-muted p-3"><p className="text-xs">Meta atingida</p><p className="text-xl font-semibold">{reached} de {targets.length}</p><p className="text-xs">Sem informação não significa produção zero</p></div>
      </div>}
      {transport.length > 0 && <><h3 className="my-3 font-semibold">Transporte</h3><div className="grid gap-3 lg:grid-cols-2">{transport.map(renderRow)}</div></>}
      {rows.some(r => r.operation === "carregamento") && <><h3 className="mb-3 mt-5 font-semibold">Carregamento — tratores</h3><div className="grid gap-3 lg:grid-cols-2">{rows.filter(r => r.operation === "carregamento").map(renderRow)}</div></>}
      {!rows.length && <p className="py-5 text-sm text-muted-foreground">Nenhuma meta ou apuração cadastrada neste mês.</p>}
      <p className="mt-4 text-xs text-muted-foreground">São totais mensais informados, não soma automática de tickets. Atualizar esta área não cria receitas, despesas nem salários. Metas são definidas por mês e não alteram meses anteriores.</p>
      {loaded.canEdit && <Button variant="outline" className="mt-4" onClick={() => setEditing(v => !v)}>{editing ? "Fechar edição" : "Definir meta / informar produção"}</Button>}
      {editing && <ProductionEditor key={loaded.month} loaded={loaded} vehicles={vehicles} onSaved={refresh} />}
    </>}
  </Card>;
}

function ProductionEditor({ loaded, vehicles, onSaved }: { loaded: Loaded; vehicles: VehicleRow[]; onSaved: () => void }) {
  const [selected, setSelected] = useState(vehicles[0]?.id ?? "");
  return <div className="mt-4 border-t border-border pt-4"><label className="text-sm">Veículo<select className={field} value={selected} onChange={e => setSelected(e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.name || v.model}</option>)}</select></label>{selected && <ProductionForm key={selected} loaded={loaded} vehicleId={selected} onSaved={onSaved} />}</div>;
}
function ProductionForm({ loaded, vehicleId, onSaved }: { loaded: Loaded; vehicleId: string; onSaved: () => void }) {
  const row = loaded.rows.find(r => r.vehicle_id === vehicleId);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const number = (key: string) => String(form.get(key) ?? "").trim() === "" ? null : Number(form.get(key));
    const payload: ProductionInput = { vehicle_id: vehicleId, month: loaded.month, operation: form.get("operation") as ProductionInput["operation"], target_tonnes: number("target"), actual_tonnes: number("actual"), diesel_liters: number("diesel"), measured_through: String(form.get("date") || "") || null, note: String(form.get("note") || ""), revision: row?.revision ?? null };
    try { const res = await fetch("/api/frota/metas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await res.json(); if (!res.ok) throw new Error(body.error); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Operação<select name="operation" className={field} defaultValue={row?.operation ?? "transporte"}><option value="transporte">Transporte</option><option value="carregamento">Carregamento</option></select></label>
    <label className="text-sm">Meta mensal (t) — deixe vazio para sem meta<input name="target" type="number" min="0.001" max="10000000" step="0.001" defaultValue={row?.target_tonnes ?? ""} className={field} /></label>
    <label className="text-sm">Total produzido no mês (t) — não incremento<input name="actual" type="number" min="0" max="10000000" step="0.001" defaultValue={row?.actual_tonnes ?? ""} className={field} /></label>
    <label className="text-sm">Diesel total do mês (L) — opcional<input name="diesel" type="number" min="0" max="10000000" step="0.001" defaultValue={row?.diesel_liters ?? ""} className={field} /></label>
    <label className="text-sm">Apurado até<input name="date" type="date" min={`${loaded.month}-01`} max={loaded.today} defaultValue={row?.measured_through ?? ""} className={field} /></label>
    <label className="text-sm">Observação / fonte<input name="note" maxLength={1000} defaultValue={row?.note ?? ""} className={field} /></label>
    <p className="text-xs text-muted-foreground sm:col-span-2">Deixe produção em branco quando não souber o total. Zero significa que você confirmou que não houve produção.</p>
    {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}<Button type="submit" isLoading={saving}>Salvar apuração de {loaded.month}</Button>
  </form>;
}
