import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), admin: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), single: vi.fn(), adminRpc: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.user }, rpc: m.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
import { GET, POST } from "./route";
const id = "10000000-0000-4000-8000-000000000001";
const req = (body: unknown, origin = "https://frota.test") => new Request("https://frota.test/api/consultoria", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
const delivery = { action: "deliver", companyId: id, password: "Temporary-12345" };
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ data: { user: { id: "consultant", email: "rafaelkamosaquario@gmail.com", email_confirmed_at: "today" } } });
  m.rpc.mockResolvedValue({ data: [], error: null });
  const chain = { select: m.select, eq: m.eq, maybeSingle: m.single };
  [m.from, m.select, m.eq].forEach(f => f.mockReturnValue(chain));
  m.single.mockResolvedValue({ data: { company_id: id, client_email: "client@example.com", contact_name: "Client", delivered_at: null }, error: null });
  m.admin.mockReturnValue({ from: m.from, rpc: m.adminRpc, auth: { admin: { createUser: m.create } } });
  m.adminRpc.mockResolvedValue({ data: null, error: null });
  m.create.mockResolvedValue({ data: { user: { id: "client" } }, error: null });
});
describe("consultancy provisioning API", () => {
  it("does not create a privileged client for unauthorized users", async () => {
    m.user.mockResolvedValue({ data: { user: { id: "other", email: "other@example.com", email_confirmed_at: "today" } } });
    expect((await GET()).status).toBe(403); expect((await POST(req(delivery))).status).toBe(403);
    expect(m.admin).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests and weak passwords before writes", async () => {
    expect((await POST(req(delivery, "https://evil.test"))).status).toBe(403);
    expect((await POST(req({ ...delivery, password: "1234" }))).status).toBe(400);
    expect(m.admin).not.toHaveBeenCalled();
  });
  it("rejects unrelated tenants and repeated delivery", async () => {
    m.single.mockResolvedValueOnce({ data: null }); expect((await POST(req(delivery))).status).toBe(403);
    m.single.mockResolvedValueOnce({ data: { delivered_at: "today" } }); expect((await POST(req(delivery))).status).toBe(409);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("creates only a new account and never returns the password", async () => {
    const response = await POST(req(delivery)); expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(delivery.password);
    expect(m.adminRpc).toHaveBeenCalledWith("consultancy_deliver", { p_company: id, p_actor: "consultant", p_user: "client" });
    expect(m.eq).toHaveBeenCalledWith("consultant_id", "consultant");
  });
  it("does not overwrite an existing Auth account", async () => {
    m.create.mockResolvedValue({ data: { user: null }, error: { message: "existing user internal details" } });
    const response = await POST(req(delivery)); expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("internal details");
    expect(m.adminRpc).not.toHaveBeenCalledWith("consultancy_deliver", expect.anything());
  });
  it("recovers an owned pending account without resetting its password", async () => {
    m.adminRpc.mockResolvedValueOnce({ data: "previous-client", error: null });
    const response = await POST(req(delivery)); expect((await response.json()).recovered).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.adminRpc).toHaveBeenCalledWith("consultancy_deliver", { p_company: id, p_actor: "consultant", p_user: "previous-client" });
  });
});
