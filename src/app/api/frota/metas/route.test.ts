import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mock.from }) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: mock.access }));
import { POST } from "./route";
const values = { vehicle_id: "3618fed2-66ec-424d-a3d5-54ac05684c64", month: "2026-09", operation: "transporte", target_tonnes: 850, actual_tonnes: null, diesel_liters: null, measured_through: null, note: "", revision: null };
const request = (body: unknown, origin = "https://frotaia.up.railway.app") => new Request("http://localhost:8080/api/frota/metas", { method: "POST", headers: { origin, "x-forwarded-host": "frotaia.up.railway.app" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mock.access.mockResolvedValue({ ok: true, role: "admin", company: { id: "company-a" } });
  const chain = { insert: mock.insert, update: mock.update, eq: mock.eq, select: mock.select, single: mock.single };
  for (const f of [mock.from, mock.insert, mock.update, mock.eq, mock.select]) f.mockReturnValue(chain);
  mock.single.mockResolvedValue({ data: values, error: null });
});
describe("production goals writes", () => {
  it("uses session company, never a payload company or financial table", async () => { expect((await POST(request(values))).status).toBe(201); expect(mock.from).toHaveBeenCalledExactlyOnceWith("fleet_monthly_production"); expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company-a" })); });
  it("updates only matching company vehicle month and revision", async () => { expect((await POST(request({ ...values, revision: 2 }))).status).toBe(200); for (const pair of [["company_id", "company-a"], ["vehicle_id", values.vehicle_id], ["month", "2026-09"], ["revision", 2]]) expect(mock.eq).toHaveBeenCalledWith(...pair); expect(mock.insert).not.toHaveBeenCalled(); });
  it.each(["23505", "PGRST116"])("rejects duplicates or stale revision %s", async code => { mock.single.mockResolvedValue({ error: { code } }); expect((await POST(request(values))).status).toBe(409); });
  it.each(["viewer", "driver"])("blocks read-only %s", async role => { mock.access.mockResolvedValue({ ok: true, role, company: { id: "a" } }); expect((await POST(request(values))).status).toBe(403); expect(mock.from).not.toHaveBeenCalled(); });
  it.each(["unauthenticated", "no_company", "not_entitled"])("blocks %s", async reason => { mock.access.mockResolvedValue({ ok: false, reason }); expect((await POST(request(values))).status).toBe(reason === "unauthenticated" ? 401 : 403); });
  it("blocks cross-origin writes", async () => { expect((await POST(request(values, "https://other.test"))).status).toBe(403); expect(mock.from).not.toHaveBeenCalled(); });
  it("blocks company injection", async () => { expect((await POST(request({ ...values, company_id: "other" }))).status).toBe(400); expect(mock.from).not.toHaveBeenCalled(); });
  it("blocks future actuals", async () => { expect((await POST(request({ ...values, month: "2099-09", actual_tonnes: 10, measured_through: "2099-09-30" }))).status).toBe(400); });
});
