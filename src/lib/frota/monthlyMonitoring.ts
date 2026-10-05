import type { MonthlyProduction } from "./productionGoals";
import { goalProgress } from "./productionGoals";
import type { ProductionRevenue } from "./productionRevenue";
import type { MonthlyExpenses } from "./monthlyExpenses";

// Explicit pilot: no behavior change for other customers and no authorization bypass.
export const monthlyMonitoringEnabled = (companyId: string) => companyId === "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac";
export type MonthlySnapshot = { month: string; today: string; rows: MonthlyProduction[]; revenueSummary: ProductionRevenue | null; expenseSummary: MonthlyExpenses | null; checkedAt?: string; payrollDue?: {date:string;amount:number}[] | null };
const money = (n: number) => n.toLocaleString("pt-BR", {style:"currency",currency:"BRL"});
export function monthlyMonitoringMessages(data: MonthlySnapshot, names: Record<string,string>) {
  const messages: string[] = [];
  if (data.revenueSummary && data.expenseSummary) {
    const r = data.revenueSummary, e = data.expenseSummary;
    messages.push(`Receitas registradas: ${money(r.total)}. Despesas: ${money(e.total)}, incluindo ${money(e.fuel)} de combustível e ${money(e.payroll)} de remunerações. Saldo parcial: ${money((Math.round(r.total*100)-Math.round(e.total*100))/100)}.`);
    const ids = new Set([...Object.keys(r.byVehicle),...Object.keys(e.byVehicle)]);
    const negatives = [...ids].map(id => ({id,cents:Math.round((r.byVehicle[id]?.amount??0)*100)-Math.round((e.byVehicle[id]?.total??0)*100)})).filter(v=>v.cents<0).sort((a,b)=>a.cents-b.cents);
    if (negatives.length) messages.push(`Confira os veículos com saldo parcial negativo: ${negatives.map(v=>`${names[v.id]??"Veículo não identificado"} (${money(v.cents/100)})`).join("; ")}. Verifique receitas e custos faltantes antes de concluir que houve prejuízo. Isso não indica culpa do motorista.`);
  } else messages.push("Fechamento financeiro indisponível nesta consulta. Não é possível concluir o saldo ou a situação dos veículos sem receitas e despesas conferidas.");
  const targets = data.rows.filter(r=>r.operation==="transporte" && r.target_tonnes!==null);
  if (targets.length) {
    const reported = targets.filter(r=>r.actual_tonnes!==null);
    const actual = reported.reduce((s,r)=>s+Math.round(r.actual_tonnes!*1000),0)/1000;
    const target = targets.reduce((s,r)=>s+Math.round(r.target_tonnes!*1000),0)/1000;
    const reached = reported.filter(r=>r.actual_tonnes!>=r.target_tonnes!).length;
    messages.push(`Transporte: ${actual.toLocaleString("pt-BR",{minimumFractionDigits:3})} t informadas de ${target.toLocaleString("pt-BR",{minimumFractionDigits:3})} t de meta; ${reached} de ${targets.length} caminhões atingiram a meta.${reported.length<targets.length?` Há ${targets.length-reported.length} veículo(s) sem apuração: ausência de informação não significa produção zero.`:""}`);
    const below = targets.filter(r=>["Abaixo da meta","Abaixo do ritmo"].includes(goalProgress(r,data.today).label));
    if(below.length) messages.push(`Acompanhe a produção: ${below.map(r=>`${names[r.vehicle_id]??"Veículo"} — ${goalProgress(r,data.today).label.toLowerCase()}`).join("; ")}.`);
  }
  if (data.rows.some(r=>r.diesel_liters!==null)) messages.push("Combustível: os consolidados permitem acompanhar litros por tonelada. Sem hodômetros suficientes, não conclua consumo em km/L. Compare veículos e operações equivalentes; carregamento dos tratores é separado do transporte.");
  if (data.expenseSummary && data.payrollDue?.length) messages.push(`Remunerações confirmadas deste fechamento, ainda sem baixa integral: ${data.payrollDue.map(p=>`${money(p.amount)} — ${p.date<data.today?"vencimento passado em":p.date===data.today?"vence hoje,":"previsto para"} ${p.date.split("-").reverse().join("/")}`).join("; ")}. Confira os pagamentos em Custos e remunerações. A ausência de baixa não comprova falta de pagamento.`);
  return messages;
}
