"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { VehicleRow } from "@/lib/supabase/tables";
import type { monthlyFuelConsolidates } from "@/lib/frota/monthlyExpenses";

type Loaded = { month: string; expenseError: string | null; fuelConsolidates: ReturnType<typeof monthlyFuelConsolidates> | null };
const number = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function MonthlyFuelConsolidates({ vehicles }: { vehicles: VehicleRow[] }) {
  const [month, setMonth] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/frota/metas${month ? `?month=${month}` : ""}`, { cache: "no-store", signal: abort.signal })
      .then(async res => { const body = await res.json(); if (!res.ok) throw new Error(body.error); if (body.expenseError) throw new Error(body.expenseError); return body as Loaded; })
      .then(body => { setLoaded(body); setError(""); setLoading(false); })
      .catch(e => { if (!abort.signal.aborted) { setError(e instanceof Error ? e.message : "Falha ao consultar consolidados."); setLoading(false); } });
    return () => abort.abort();
  }, [month, revision]);
  const rows = (loaded?.fuelConsolidates ?? []).filter(r => !vehicle || r.vehicleId === vehicle);
  return <Card className="mb-5 p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Diesel — consolidados mensais</h2>
    <p className="mt-1 text-sm text-muted-foreground">Totais informados para caminhões e tratores. Separados dos abastecimentos individuais, sem gerar novas despesas.</p>
    <div className="my-4 flex flex-wrap gap-4">
      <label className="text-sm">Mês de referência<input aria-label="Mês dos consolidados de diesel" type="month" min="2000-01" max="2099-12" value={month || loaded?.month || ""} onChange={e => { if (e.target.value) { setLoading(true); setMonth(e.target.value); } }} className="mt-1 block rounded-lg border border-border bg-surface p-2" /></label>
      <label className="text-sm">Veículo<select value={vehicle} onChange={e => setVehicle(e.target.value)} className="mt-1 block rounded-lg border border-border bg-surface p-2"><option value="">Todos os veículos</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.name || v.model}</option>)}</select></label>
    </div>
    {loading ? <p role="status">Carregando consolidados...</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => { setLoading(true); setRevision(v => v + 1); }}>Tentar novamente</Button></div> : <>
      {!rows.length ? <p className="text-sm">Nenhum total mensal de diesel informado para esta seleção.</p> : <>
        <p className="mb-3 text-sm"><strong>{number(rows.reduce((s, r) => s + r.liters, 0))} L</strong> informados · despesas mensais identificadas: <strong>{money(rows.reduce((s, r) => s + Math.round((r.amount ?? 0) * 100), 0) / 100)}</strong>{rows.some(r => r.amount === null) ? " · há totais sem despesa identificada" : ""}</p>
        <div className="grid gap-3 lg:grid-cols-2">{rows.map(r => {
          const v = vehicles.find(v => v.id === r.vehicleId);
          return <article key={r.vehicleId} className="rounded-lg border border-border p-3"><h3 className="font-semibold">{v ? `${v.plate} · ${v.name || v.model}` : "Veículo indisponível"}</h3><p className="mt-2 text-sm">{number(r.liters)} L · {r.amount === null ? "Despesa mensal não identificada" : money(r.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{r.operation === "carregamento" ? "Carregamento" : "Transporte"}{r.tonnes !== null ? ` · ${number(r.tonnes)} t` : ""}{r.tonnes !== null && r.tonnes > 0 ? ` · ${number(r.liters / r.tonnes)} L/t` : ""}</p>{r.needsReview && <p role="status" className="mt-2 text-sm text-warning">Conferir: existem múltiplas despesas de combustível neste veículo/mês. Não some um consolidado com os abastecimentos que ele já inclui.</p>}<p className="mt-2 text-xs text-muted-foreground">{r.expenseIds.length} despesa(s) existente(s) identificada(s) pelo marcador de consolidado mensal.</p></article>;
        })}</div>
      </>}
      <p className="mt-3 text-xs text-muted-foreground">Abertura no último mês com produção informada. Litros vêm da apuração mensal; valores vêm das despesas existentes identificadas como CONSOLIDADO MENSAL do mesmo veículo e mês. Não são abastecimentos individuais e não entram no cálculo de km/L, pois não têm hodômetro. Alterar a apuração não altera a despesa automaticamente.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-primary"><Link href="/frota/despesas">Conferir despesas</Link><Link href="/frota/dashboard#metas-producao">Ver resultado e apuração mensal</Link></div>
    </>}
  </Card>;
}
