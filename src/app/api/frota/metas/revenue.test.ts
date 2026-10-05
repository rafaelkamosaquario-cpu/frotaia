import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), revenues: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: mocks.access }));
vi.mock("@/services/supabase/revenueService", () => ({ listRevenues: mocks.revenues }));
import { GET } from "./route";
const req = () => new Request("https://frotaia.up.railway.app/api/frota/metas?month=2026-09");
beforeEach(() => {
  vi.clearAllMocks(); mocks.access.mockResolvedValue({ ok: true, role: "admin", company: { id: "company-a" } });
  const chain = { select: mocks.select, eq: mocks.eq, order: mocks.order };
  for (const f of [mocks.from, mocks.select, mocks.eq]) f.mockReturnValue(chain);
  mocks.order.mockResolvedValue({ data: [{ vehicle_id: "truck", operation: "transporte" }], error: null });
  mocks.revenues.mockResolvedValue([{ id: "r1", vehicle_id: "truck", amount: 100 }]);
});
describe("dashboard month revenue read", () => {
  it("reads every revenue page with explicit company and calendar month", async () => {
    const response = await GET(req()); const data = await response.json();
    expect(data.revenueSummary.total).toBe(100);
    expect(mocks.revenues).toHaveBeenCalledWith(expect.anything(), { companyId: "company-a", dateFrom: "2026-09-01", dateTo: "2026-09-30", all: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("fleet_monthly_production");
  });
  it("does not present query failure as zero revenue or lose production", async () => {
    mocks.revenues.mockRejectedValue(new Error("unavailable")); const data = await (await GET(req())).json();
    expect(data.revenueSummary).toBeNull(); expect(data.revenueError).toBeTruthy(); expect(data.rows).toHaveLength(1);
  });
  it("does not read finance without panel access", async () => {
    mocks.access.mockResolvedValue({ ok: false, reason: "unauthenticated" }); expect((await GET(req())).status).toBe(401); expect(mocks.revenues).not.toHaveBeenCalled();
  });
  it("rejects invalid month before revenue query", async () => {
    expect((await GET(new Request("https://frotaia.up.railway.app/api/frota/metas?month=2026-99"))).status).toBe(400); expect(mocks.revenues).not.toHaveBeenCalled();
  });
});
