import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), write: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: mocks.access }));
vi.mock("@/services/supabase/revenueService", () => ({ recordRevenue: mocks.write, updateRevenue: mocks.write, deleteRevenue: mocks.write, listRevenues: vi.fn() }));
vi.mock("@/services/supabase/expenseService", () => ({ recordExpense: mocks.write, updateExpense: mocks.write, deleteExpense: mocks.write, listExpenses: vi.fn() }));
import { POST as revenuePost } from "./receitas/route";
import { POST as expensePost } from "./despesas/route";
import { PATCH as revenuePatch, DELETE as revenueDelete } from "./receitas/[id]/route";
import { PATCH as expensePatch, DELETE as expenseDelete } from "./despesas/[id]/route";

describe("financial API authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.write.mockResolvedValue({}); });
  for (const role of ["owner", "admin", "operator", "viewer"]) {
    for (const [name, handler, method, deleting] of [
      ["revenue create", revenuePost, "POST", false], ["expense create", expensePost, "POST", false],
      ["revenue update", revenuePatch, "PATCH", false], ["expense update", expensePatch, "PATCH", false],
      ["revenue delete", revenueDelete, "DELETE", true], ["expense delete", expenseDelete, "DELETE", true],
    ] as const) {
      it(`${role}: ${name}`, async () => {
        mocks.access.mockResolvedValue({ ok: true, userId: "u", company: { id: "c" }, role });
        const response = await handler(new Request("https://test.local", {
          method, body: deleting ? undefined : JSON.stringify({ amount: 100, revenueDate: "2026-09-22", expenseDate: "2026-09-22", expenseType: "outro" }),
        }), { params: Promise.resolve({ id: "record" }) });
        const allowed = role === "owner" || role === "admin" || (!deleting && role === "operator");
        expect(response.status).toBe(allowed ? (method === "POST" ? 201 : 200) : 403);
        expect(mocks.write).toHaveBeenCalledTimes(allowed ? 1 : 0);
        if (!allowed) expect(mocks.admin).not.toHaveBeenCalled();
      });
    }
  }
});
