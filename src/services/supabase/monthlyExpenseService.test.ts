import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ expenses: vi.fn() }));
vi.mock("./expenseService", () => ({ listExpenses: mocks.expenses }));
import { loadMonthlyExpenses } from "./monthlyExpenseService";
import type { SupabaseDbClient } from "./types";
beforeEach(() => vi.clearAllMocks());
it("reads the whole calendar month and scopes payroll links to expense IDs and company", async () => {
  const expenses = Array.from({length:101}, (_,i) => ({id:`e${i}`,amount:1,vehicle_id:null,expense_type:"outro"}));
  mocks.expenses.mockResolvedValue(expenses);
  const chain = {select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data:[{expense_id:"e0",snapshot:{category:"salario"}}],error:null})};
  for (const fn of [chain.select,chain.eq,chain.in,chain.order]) fn.mockReturnValue(chain);
  const db = {from:vi.fn().mockReturnValue(chain)};
  const result = await loadMonthlyExpenses(db as unknown as SupabaseDbClient,"company-a","2026-09");
  expect(mocks.expenses).toHaveBeenCalledWith(db,{companyId:"company-a",dateFrom:"2026-09-01",dateTo:"2026-09-30",all:true});
  expect(chain.eq).toHaveBeenCalledWith("company_id","company-a");
  expect(chain.in.mock.calls.map(c=>c[1].length)).toEqual([100,1]);
  expect(result.summary).toMatchObject({payroll:1,other:100,total:101});
});
it("propagates payroll classification errors instead of showing payroll zero", async () => {
  mocks.expenses.mockResolvedValue([{id:"e1",amount:20}]);
  const chain = {select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data:null,error:new Error("denied")})};
  for (const fn of [chain.select,chain.eq,chain.in,chain.order]) fn.mockReturnValue(chain);
  await expect(loadMonthlyExpenses({from:()=>chain} as unknown as SupabaseDbClient,"company-a","2026-09")).rejects.toThrow("denied");
});
it("does not query cost entries when the month has no expenses", async () => {
  mocks.expenses.mockResolvedValue([]); const from = vi.fn();
  expect((await loadMonthlyExpenses({from} as unknown as SupabaseDbClient,"company-a","2026-10")).summary.total).toBe(0);
  expect(from).not.toHaveBeenCalled();
});
