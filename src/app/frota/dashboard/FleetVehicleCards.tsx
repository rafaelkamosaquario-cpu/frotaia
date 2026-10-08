"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Truck, Tractor, UserRound, Search, Sparkles } from "lucide-react";
import type { DriverRow, VehicleRow } from "@/lib/supabase/tables";
import type { MonthlySnapshot } from "@/lib/frota/monthlyMonitoring";
import { goalProgress, type MonthlyProduction } from "@/lib/frota/productionGoals";
import { fleetIllustration, followingMonth, monthLabel, partialBalance } from "@/lib/frota/fleetPresentation";
import { askFrotaAiWidget } from "@/components/frota/frotaAiWidgetBus";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const tonnes = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const filters = ["Todos", "Caminhões", "Tratores", "Abaixo da meta", "Saldo negativo", "Sem apuração"] as const;

export function FleetVehicleCards({ companyId, vehicles, drivers, data }: { companyId: string; vehicles: VehicleRow[]; drivers: DriverRow[]; data: MonthlySnapshot }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("Todos");
  const [comparison, setComparison] = useState<{ month: string; rows: MonthlyProduction[] } | null>(null);
  const [comparisonError, setComparisonError] = useState(false);
  const nextMonth = followingMonth(data.month);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/frota/metas?month=${nextMonth}`, { signal: abort.signal, cache: "no-store" })
      .then(async res => { if (!res.ok) throw new Error("comparison"); return res.json(); })
      .then(body => { if (!abort.signal.aborted) { setComparison({ month: body.month, rows: body.rows }); setComparisonError(false); } })
      .catch(() => { if (!abort.signal.aborted) { setComparison(null); setComparisonError(true); } });
    return () => abort.abort();
  }, [companyId, nextMonth, data.checkedAt]);
  const rows = vehicles.filter(v => v.company_id === companyId && (v.active || data.rows.some(r => r.vehicle_id === v.id)));
  const visible = rows.filter(v => {
    const r = data.rows.find(r => r.vehicle_id === v.id);
    const tractor = fleetIllustration(companyId, v)?.tractor || r?.operation === "carregamento" || /trator|tractor/i.test(`${v.vehicle_type} ${v.name}`);
    const driverNames = drivers.filter(d => d.active && d.company_id === companyId && [d.vehicle_id, d.additional_vehicle_id_1, d.additional_vehicle_id_2].includes(v.id)).map(d => d.name).join(" ");
    if (!`${v.plate} ${v.name} ${v.brand} ${v.model} ${driverNames}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))) return false;
    if (filter === "Caminhões") return !tractor;
    if (filter === "Tratores") return tractor;
    if (filter === "Sem apuração") return r?.actual_tonnes == null;
    if (filter === "Abaixo da meta") return r?.actual_tonnes != null && r.target_tonnes != null && r.actual_tonnes < r.target_tonnes;
    if (filter === "Saldo negativo") return data.revenueSummary && data.expenseSummary && partialBalance(data.revenueSummary.byVehicle[v.id]?.amount ?? 0, data.expenseSummary.byVehicle[v.id]?.total ?? 0) < 0;
    return true;
  });
  return <section className="fleet-cards-section" aria-label="Cards dos veículos">
    <div className="fleet-section-heading"><div><h3>Sua frota <span>{rows.length}</span></h3><p>Produção e resultado de {monthLabel(data.month)} · valores registrados</p></div><label className="fleet-search"><Search size={17} aria-hidden /><input aria-label="Buscar veículo ou motorista" placeholder="Buscar placa, veículo ou motorista" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="fleet-filter-row" role="group" aria-label="Filtrar veículos">{filters.map(name => <button type="button" key={name} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>
    <div className="fleet-vehicle-grid">{visible.map(v => {
      const r = data.rows.find(r => r.vehicle_id === v.id);
      const progress = r ? goalProgress(r, data.today) : null;
      const art = fleetIllustration(companyId, v);
      const linked = drivers.filter(d => d.active && d.company_id === companyId && [d.vehicle_id, d.additional_vehicle_id_1, d.additional_vehicle_id_2].includes(v.id));
      const revenue = data.revenueSummary?.byVehicle[v.id];
      const expense = data.expenseSummary?.byVehicle[v.id];
      const balance = data.revenueSummary && data.expenseSummary ? partialBalance(revenue?.amount ?? 0, expense?.total ?? 0) : null;
      const next = comparison?.month === nextMonth ? comparison.rows.find(row => row.vehicle_id === v.id) : undefined;
      const nextTarget = next?.target_tonnes ?? null;
      const scale = Math.max(r?.actual_tonnes ?? 0, nextTarget ?? 0, 1);
      const below = progress?.closed && r?.actual_tonnes != null && r.target_tonnes != null && r.actual_tonnes < r.target_tonnes;
      return <article className="fleet-vehicle-card" key={v.id}>
        <div className="fleet-card-title"><div><h4>{v.plate || v.name || "Veículo"}</h4><p>{v.name || [v.brand, v.model].filter(Boolean).join(" ")}</p>{art && <small>{art.caption}</small>}</div><span className={`fleet-status ${progress?.tone ?? "neutral"}`}>{!v.active ? "Inativo" : progress?.label ?? "Sem apuração"}</span></div>
        <div className="fleet-vehicle-picture">{art ? <Image src={art.image} alt={`Ilustração genérica: ${art.caption}`} width={300} height={110} sizes="310px" loading="lazy" /> : r?.operation === "carregamento" ? <Tractor size={72} aria-hidden /> : <Truck size={72} aria-hidden />}<span>Ilustração</span></div>
        <div className="fleet-driver"><UserRound size={15} aria-hidden /><span>{linked.map(d => d.name).join(" · ") || "Sem motorista vinculado"}</span></div>
        <figure className="fleet-production-mini" aria-label={`Produção de ${monthLabel(data.month)} e meta de ${monthLabel(nextMonth)}`}>
          <div className="fleet-mini-bars" aria-hidden="true"><div><b>{r?.actual_tonnes == null ? "—" : tonnes(r.actual_tonnes)}</b><div className="fleet-bar-track"><i className={below ? "below" : progress?.tone === "success" ? "reached" : "partial"} style={{ height: r?.actual_tonnes == null ? 0 : `${r.actual_tonnes / scale * 100}%` }} /></div><small>{monthLabel(data.month)}</small><em>Realizado</em></div><div><b>{nextTarget == null ? "—" : tonnes(nextTarget)}</b><div className="fleet-bar-track"><i className="target" style={{ height: nextTarget == null ? 0 : `${nextTarget / scale * 100}%` }} /></div><small>{monthLabel(nextMonth)}</small><em>Meta</em></div></div>
          <figcaption><strong>{r?.actual_tonnes == null ? "Sem apuração" : `${tonnes(r.actual_tonnes)} t realizadas`}</strong><span>{progress?.closed ? "Período encerrado" : "Apuração parcial ou pendente"}</span>{progress?.percent != null && <b className={below ? "text-danger" : "text-muted-foreground"}>{progress.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta</b>}<small>{r?.target_tonnes ? `Meta do período: ${tonnes(r.target_tonnes)} t` : "Sem meta no período"}</small><small className="text-success">{monthLabel(nextMonth)}: {nextTarget != null ? `meta ${tonnes(nextTarget)} t` : comparisonError ? "comparação indisponível" : comparison?.month === nextMonth ? "meta não cadastrada" : "consultando meta…"}</small><small>{next?.actual_tonnes != null ? `Produção: ${tonnes(next.actual_tonnes)} t` : "Produção seguinte não informada"}</small></figcaption>
        </figure>
        <div className="fleet-money"><div><span>Receita registrada</span><strong>{data.revenueSummary ? money(revenue?.amount ?? 0) : "Indisponível"}</strong></div><div><span>Combustível / diesel</span><strong>{data.expenseSummary ? money(expense?.fuel ?? 0) : "Indisponível"}</strong></div></div>
        <div className="fleet-card-result"><span>Saldo parcial<small>Inclui remunerações e demais despesas</small></span><strong className={balance != null && balance < 0 ? "text-danger" : "text-success"}>{balance == null ? "Indisponível" : money(balance)}</strong></div>
        <details className="fleet-card-details"><summary>Ver detalhes</summary><div><p>Remunerações: {data.expenseSummary ? money(expense?.payroll ?? 0) : "Indisponível"}</p><p>Outras despesas: {data.expenseSummary ? money(expense?.other ?? 0) : "Indisponível"}</p><p>Diesel informado: {r?.diesel_liters == null ? "Não informado" : `${tonnes(r.diesel_liters)} L`}</p>{r?.actual_tonnes != null && r.actual_tonnes > 0 && r.diesel_liters != null && <p>Índice: {tonnes(r.diesel_liters / r.actual_tonnes)} L/t</p>}<p>{r?.measured_through ? `Apurado até ${r.measured_through.split("-").reverse().join("/")}` : "Sem data de apuração"}</p>{r?.note && <p>{r.note}</p>}<p>Vínculo de motorista não identifica quem operou em cada viagem. Saldo parcial não é lucro líquido.</p><Link href="/frota/veiculos">Abrir cadastro de veículos →</Link></div></details>
        <button className="fleet-ask" type="button" onClick={() => askFrotaAiWidget(`Analise o veículo ${v.plate || v.name} em ${data.month}: produção, meta, combustível, remunerações e saldo parcial. Consulte os registros da minha empresa e indique dados faltantes.`)}><Sparkles size={15} aria-hidden /> Pergunte ao Frota IA</button>
      </article>;
    })}</div>
    {!visible.length && <p className="py-8 text-center text-muted-foreground">Nenhum veículo encontrado para este filtro.</p>}
  </section>;
}
