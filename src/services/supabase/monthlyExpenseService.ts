import type { SupabaseDbClient } from "./types";
import { listExpenses } from "./expenseService";
import { readAllPages } from "./readAllPages";
import { productionMonthRange } from "@/lib/frota/productionRevenue";
import { summarizeMonthlyExpenses, pendingMonthlyPayroll, type PayrollLink } from "@/lib/frota/monthlyExpenses";

export async function loadMonthlyExpenses(db: SupabaseDbClient, companyId: string, month: string) {
  const expenses = await listExpenses(db, { companyId, ...productionMonthRange(month), all: true });
  const costs: PayrollLink[] = [];
  // Chunk IDs to bound URL size; paginate each chunk rather than relying on the API row limit.
  for (let start = 0; start < expenses.length; start += 100) {
    const ids = expenses.slice(start, start + 100).map(e => e.id);
    costs.push(...await readAllPages<PayrollLink>(async (offset, size) => {
      const { data, error } = await db.from("cost_entries").select("id,expense_id,snapshot,amount,due_date,paid_on")
        .eq("company_id", companyId).in("expense_id", ids).order("id").range(offset, offset + size - 1);
      if (error) throw error;
      return (data ?? []) as PayrollLink[];
    }));
  }
  return { expenses, summary: summarizeMonthlyExpenses(expenses, costs), payrollDue: pendingMonthlyPayroll(costs) };
}
