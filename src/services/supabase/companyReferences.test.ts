import { describe, expect, it, vi } from "vitest";
import { recordRevenue, updateRevenue } from "./revenueService";
import { recordExpense, updateExpense } from "./expenseService";
import { assertCompanyReferences } from "./companyReferences";
function client(found: boolean) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: found ? { id: "id" } : null, error: null })), insert: vi.fn(), update: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  return { from: vi.fn(() => query), query };
}
describe("company ownership before privileged financial writes", () => {
  it("requires both id and company on every reference", async () => {
    const c = client(true);
    await assertCompanyReferences(c as never, "company-a", { vehicles: "vehicle", drivers: "driver" });
    expect(c.query.eq).toHaveBeenCalledWith("company_id", "company-a");
    expect(c.from).toHaveBeenCalledWith("vehicles"); expect(c.from).toHaveBeenCalledWith("drivers");
  });
  for (const operation of [
    (c: never) => recordRevenue(c, { companyId: "a", userId: "u", vehicleId: "foreign", amount: 10, revenueDate: "2026-09-22" }),
    (c: never) => updateRevenue(c, "r", "a", { driverId: "foreign" }),
    (c: never) => recordExpense(c, { companyId: "a", userId: "u", vehicleId: "foreign", amount: 10, expenseDate: "2026-09-22", expenseType: "outro" }),
    (c: never) => updateExpense(c, "e", "a", { vehicleId: "foreign" }),
  ]) {
    it("rejects foreign/missing IDs without inserting or updating", async () => {
      const c = client(false);
      await expect(operation(c as never)).rejects.toMatchObject({ code: "INVALID_COMPANY_REFERENCE" });
      expect(c.query.insert).not.toHaveBeenCalled(); expect(c.query.update).not.toHaveBeenCalled();
    });
  }
  it("allows omitted/null optional links", async () => {
    const c = client(false);
    await assertCompanyReferences(c as never, "a", { vehicles: null, drivers: undefined });
    expect(c.from).not.toHaveBeenCalled();
  });
});
