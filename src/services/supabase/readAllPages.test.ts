import { expect, it, vi } from "vitest";
import { readAllPages } from "./readAllPages";
import { listRevenues } from "./revenueService";
import { listExpenses } from "./expenseService";

for (const list of [listRevenues, listExpenses]) {
  it("reports all 1201 financial entries with stable pagination and company filters", async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => ({ id: String(i), amount: 10 }));
    const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), gte: vi.fn(), lte: vi.fn(), range: vi.fn(async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null })) };
    for (const method of ["select", "eq", "order", "gte", "lte"] as const) q[method].mockReturnValue(q);
    const result = await list({ from: () => q } as never, { companyId: "a", dateFrom: "2026-09-01", dateTo: "2026-09-30", all: true });
    expect(result.length).toBe(1201);
    expect(result.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(12010);
    expect(q.range.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
    expect(q.eq).toHaveBeenCalledWith("company_id", "a");
    expect(q.order).toHaveBeenCalledWith("id", { ascending: false });
  });
}
it("does not return a misleading partial total when a later page fails", async () => {
  const fetch = vi.fn().mockResolvedValueOnce([1, 2]).mockRejectedValueOnce(new Error("offline"));
  await expect(readAllPages(fetch, 2)).rejects.toThrow("offline");
});
it("handles an exact page boundary", async () => {
  const fetch = vi.fn().mockResolvedValueOnce([1,2]).mockResolvedValueOnce([]);
  expect(await readAllPages(fetch, 2)).toEqual([1,2]);
});
