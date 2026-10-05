import { describe, expect, it } from "vitest";
import { productionMonthRange, summarizeProductionRevenue } from "./productionRevenue";
describe("recorded monthly revenue on dashboard", () => {
  const rows = [{ vehicle_id: "truck", operation: "transporte" as const }, { vehicle_id: "loader", operation: "carregamento" as const }];
  it("adds existing entries, without multiplying quantities or duplicating salaries", () => {
    const result = summarizeProductionRevenue(rows, [{ id: "1", vehicle_id: "truck", amount: 66988.60 }, { id: "2", vehicle_id: "loader", amount: 6878.20 }]);
    expect(result).toMatchObject({ transport: 66988.60, loading: 6878.20, total: 73866.80, count: 2 });
    expect(result.byVehicle.loader).toEqual({ amount: 6878.20, count: 1 });
  });
  it("preserves legitimate same-value entries and deduplicates only identical ids", () => {
    const a = { id: "1", vehicle_id: "truck", amount: 10.10 };
    expect(summarizeProductionRevenue(rows, [a, a, { ...a, id: "2" }]).total).toBe(20.20);
  });
  it("includes unassigned and unclassified revenues in total, not in a guessed operation", () => {
    expect(summarizeProductionRevenue(rows, [{ id: "1", vehicle_id: null, amount: 10 }, { id: "2", vehicle_id: "unknown", amount: 20 }])).toMatchObject({ transport: 0, loading: 0, other: 30, total: 30 });
  });
  it("does not invent revenue when there are production rows but no financial entries", () => expect(summarizeProductionRevenue(rows, [])).toMatchObject({ total: 0, count: 0, byVehicle: {} }));
  it.each([["2026-09", "2026-09-30"], ["2026-12", "2026-12-31"], ["2028-02", "2028-02-29"]])("uses whole calendar month %s", (month, last) => expect(productionMonthRange(month)).toEqual({ dateFrom: `${month}-01`, dateTo: last }));
});
