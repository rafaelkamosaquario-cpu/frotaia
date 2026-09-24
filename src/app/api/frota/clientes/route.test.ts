import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: mocks.access }));
import { POST } from "./route";
const values = { name: " Randa ", legal_name: "", cnpj: "", address: "", city: "", state: "", closing_day: null, notes: "" };
const request = (body: unknown, origin?: string) => new Request("https://frotaia.app.br/api/frota/clientes", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true, role: "owner", company: { id: "company-a" } });
  const chain = { insert: mocks.insert, update: mocks.update, eq: mocks.eq, select: mocks.select, single: mocks.single };
  mocks.from.mockReturnValue(chain); mocks.insert.mockReturnValue(chain); mocks.update.mockReturnValue(chain); mocks.eq.mockReturnValue(chain); mocks.select.mockReturnValue(chain);
  mocks.single.mockResolvedValue({ data: { id: "saved", ...values }, error: null });
});
describe("V2 freight customer registration", () => {
  it("creates only a customer in the authenticated company", async () => {
    expect((await POST(request(values))).status).toBe(201);
    expect(mocks.from).toHaveBeenCalledWith("freight_customers");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Randa", company_id: "company-a", cnpj: null, closing_day: null }));
  });
  it("scopes updates to company and id", async () => {
    const id = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    expect((await POST(request({ ...values, id }))).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "company-a"); expect(mocks.eq).toHaveBeenCalledWith("id", id);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["viewer", "driver"])("rejects read-only role %s", async role => {
    mocks.access.mockResolvedValue({ ok: true, role, company: { id: "company-a" } });
    expect((await POST(request(values))).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["unauthenticated", "no_company", "not_entitled"])("rejects %s", async reason => {
    mocks.access.mockResolvedValue({ ok: false, reason });
    expect((await POST(request(values))).status).toBe(reason === "unauthenticated" ? 401 : 403); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([{ company_id: "other" }, { closing_day: 32 }, { closing_day: 0 }, { cnpj: "123" }, { name: " " }, { amount: 100 }])("rejects invalid and injected fields %j", async patch => {
    expect((await POST(request({ ...values, ...patch }))).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes", async () => { expect((await POST(request(values, "https://other.test"))).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled(); });
  it("reports duplicates without overwriting", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await POST(request(values))).status).toBe(409); expect(mocks.update).not.toHaveBeenCalled();
  });
});

