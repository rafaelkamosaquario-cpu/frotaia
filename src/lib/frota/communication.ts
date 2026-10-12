import type { MonthlySnapshot } from "./monthlyMonitoring";
import { fleetCardStatus } from "./fleetCardStatus";
import { partialBalance } from "./fleetPresentation";

export const COMMUNICATION_GUIDE = "PADRÃO FROTA IA (WhatsApp e painel): avisos e resumos operacionais devem começar pelo que importa, em poucas linhas. Identifique veículo por placa/nome e período quando disponíveis; não invente identificação nem mês. Apresente produção com unidade, receita, despesa e saldo parcial apenas quando houver registros consultados. Diferencie não informado, zero e indisponível. Saldo parcial não é lucro líquido nem confirmação de pagamento. Feche com uma ação clara quando necessária. Não use tabela Markdown no WhatsApp. Detalhe somente quando solicitado. Não prometa imagem, envio ou agendamento sem confirmação da ferramenta. Não repita a apresentação em toda resposta; use 'Frota IA informa' para avisos e relatórios.";
const money = (value: number | null) => value === null ? "Indisponível" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantity = (value: number | null | undefined, unit: string) => value == null ? "Não informada" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unit}`;
export type OperationalReport = { title: string; company: string; subject: string; period: string; fields: { label: string; value: string }[]; notice: string; checkedAt?: string };
export function operationalReport(data: MonthlySnapshot, company: string, vehicle?: { id: string; label: string; active?: boolean }): OperationalReport {
  const row = vehicle ? data.rows.find(r => r.vehicle_id === vehicle.id) : undefined;
  const revenues = data.revenueSummary, expenses = data.expenseSummary;
  const revenue = revenues ? vehicle ? revenues.byVehicle[vehicle.id]?.amount ?? 0 : revenues.total : null;
  const expense = expenses ? vehicle ? expenses.byVehicle[vehicle.id]?.total ?? 0 : expenses.total : null;
  const fuel = expenses ? vehicle ? expenses.byVehicle[vehicle.id]?.fuel ?? 0 : expenses.fuel : null;
  const fields: OperationalReport["fields"] = vehicle ? [
    { label: row?.operation === "carregamento" ? "Carregamento" : "Produção", value: quantity(row?.actual_tonnes, "t") },
    { label: "Meta do período", value: row?.target_tonnes == null ? "Não definida" : quantity(row.target_tonnes, "t") },
    { label: "Situação", value: fleetCardStatus(row, data.today, vehicle?.active ?? true).label },
    { label: "Diesel informado", value: quantity(row?.diesel_liters, "L") },
  ] : ["transporte", "carregamento"].map(operation => {
    const rows = data.rows.filter(r => r.operation === operation), known = rows.filter(r => r.actual_tonnes !== null);
    const total = known.reduce((s, r) => s + Math.round(r.actual_tonnes! * 1000), 0) / 1000;
    return { label: operation === "transporte" ? "Transporte" : "Carregamento", value: known.length ? `${quantity(total, "t")} registradas${known.length < rows.length ? " · apuração incompleta" : ""}` : "Não informado" };
  });
  fields.push({ label: "Receita registrada", value: money(revenue) }, { label: "Despesas registradas", value: money(expense) }, { label: "Diesel (incluído nas despesas)", value: money(fuel) }, { label: "Saldo parcial", value: money(revenue === null || expense === null ? null : partialBalance(revenue, expense)) });
  if (row?.measured_through) fields.push({ label: "Produção apurada até", value: row.measured_through.split("-").reverse().join("/") });
  return { title: "Frota IA informa", company, subject: vehicle?.label ?? "Resumo da operação", period: data.month.split("-").reverse().join("/"), fields, notice: "Valores registrados. Não é lucro líquido nem confirmação de pagamento. Confira dados faltantes no painel.", checkedAt: data.checkedAt };
}
export function reportText(report: OperationalReport) {
  return [report.title, report.company, report.subject, `Período: ${report.period}`, "", ...report.fields.map(f => `${f.label}: ${f.value}`), "", report.notice].filter(line => line !== undefined).join("\n");
}
export function alertText(input: { title: string; notes?: string | null; scheduledFor?: string | null; company?: string | null; vehicle?: string | null }) {
  const when = input.scheduledFor && !Number.isNaN(Date.parse(input.scheduledFor)) ? new Date(input.scheduledFor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null;
  return ["Frota IA informa", input.company, input.vehicle ? `Veículo: ${input.vehicle}` : null, input.title.replace(/^\s*(?:Frota IA informa\s*[:—-]?\s*)/i, ""), when ? `Aviso agendado: ${when} (Brasília)` : null, input.notes?.trim()].filter(Boolean).join("\n");
}
