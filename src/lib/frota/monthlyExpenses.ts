import type { ExpenseRow } from "@/lib/supabase/tables";
import type { MonthlyProduction } from "./productionGoals";

export type ExpenseSource = Pick<ExpenseRow, "id" | "vehicle_id" | "amount" | "expense_type" | "description" | "fuel_fillup_id">;
export type PayrollLink = { expense_id: string | null; amount?: number; due_date?: string; paid_on?: string | null; snapshot: { category?: string; advances?: { amount: number }[] } };
export function pendingMonthlyPayroll(costs: PayrollLink[]) {
  const seen = new Set<string>();
  const dates = new Map<string, number>();
  for (const c of costs) {
    if (!c.expense_id || seen.has(c.expense_id) || c.paid_on || !c.due_date || c.amount === undefined || !["salario","pro_labore"].includes(c.snapshot.category ?? "")) continue;
    seen.add(c.expense_id);
    const remaining = Math.max(0,Math.round(c.amount*100)-(c.snapshot.advances??[]).reduce((s,a)=>s+Math.round(a.amount*100),0));
    if(remaining) dates.set(c.due_date,(dates.get(c.due_date)??0)+remaining);
  }
  return [...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,cents])=>({date,amount:cents/100}));
}
export type MonthlyExpenses = ReturnType<typeof summarizeMonthlyExpenses>;

/** Expenses are the money source. Cost entries only classify existing expense IDs. */
export function summarizeMonthlyExpenses(expenses: ExpenseSource[], costs: PayrollLink[]) {
  const payroll = new Set(costs.filter(c => ["salario", "pro_labore"].includes(c.snapshot.category ?? "")).map(c => c.expense_id));
  const byVehicle: Record<string, { fuel: number; payroll: number; other: number; total: number }> = {};
  const total = { fuel: 0, payroll: 0, other: 0, total: 0 };
  const seen = new Set<string>();
  for (const e of expenses) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const category = payroll.has(e.id) ? "payroll" : e.expense_type === "combustivel" ? "fuel" : "other";
    const cents = Math.round(e.amount * 100);
    total[category] += cents; total.total += cents;
    if (e.vehicle_id) {
      const vehicle = byVehicle[e.vehicle_id] ??= { fuel: 0, payroll: 0, other: 0, total: 0 };
      vehicle[category] += cents; vehicle.total += cents;
    }
  }
  for (const bucket of [total, ...Object.values(byVehicle)]) {
    bucket.fuel /= 100; bucket.payroll /= 100; bucket.other /= 100; bucket.total /= 100;
  }
  return { ...total, count: seen.size, byVehicle };
}

/** Read-only reconciliation of explicitly labelled legacy monthly imports, not individual fillups. */
export function monthlyFuelConsolidates(month: string, production: MonthlyProduction[], expenses: ExpenseSource[]) {
  const unique = [...new Map(expenses.map(e => [e.id, e])).values()];
  return production.filter(p => p.diesel_liters !== null).map(p => {
    const fuel = unique.filter(e => e.vehicle_id === p.vehicle_id && e.expense_type === "combustivel");
    const matched = fuel.filter(e => !e.fuel_fillup_id && new RegExp(`^\\[CONSOLIDADO MENSAL ${month}(?:\\]| - )`).test(e.description ?? ""));
    return { vehicleId: p.vehicle_id, liters: p.diesel_liters!, tonnes: p.actual_tonnes, operation: p.operation,
      expenseIds: matched.map(e => e.id), amount: matched.length ? matched.reduce((s, e) => s + Math.round(e.amount * 100), 0) / 100 : null,
      needsReview: matched.length > 1 || (matched.length > 0 && fuel.some(e => !matched.includes(e))) };
  });
}
