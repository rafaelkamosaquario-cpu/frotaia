import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), member: vi.fn(), draft: vi.fn(), read: vi.fn(), write: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: m.member }; return { auth: { getUser: m.user }, from: () => chain }; } }));
vi.mock("@/services/supabase/companyModulesService", () => ({ readCompanyModules: m.read }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (name: string) => {
  if (name === "consultancy_onboardings") { const chain = { select: () => chain, eq: () => chain, maybeSingle: m.draft }; return chain; }
  const chain = { insert: m.insert, update: m.update, select: () => chain, eq: m.eq, single: m.write, maybeSingle: m.write };
  m.insert.mockReturnValue(chain); m.update.mockReturnValue(chain); m.eq.mockReturnValue(chain); return chain;
} }) }));
import { GET, POST } from "./route";
const companyId = "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac";
const request = (body: unknown, origin = "https://frota.test") => new Request("https://frota.test/api/consultoria/modulos", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
const command = { companyId, revision: 0, enabled: ["frota"] };
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ data: { user: { id: "consultant", email: "rafaelkamosaquario@gmail.com", email_confirmed_at: "2026-01-01" } } });
  m.member.mockResolvedValue({ data: { company_id: companyId } }); m.draft.mockResolvedValue({ data: null });
  m.read.mockResolvedValue(null); m.write.mockResolvedValue({ data: { revision: 1 } });
});
describe("consultancy module settings", () => {
  it("rejects CSRF and unknown module ids", async () => {
    expect((await POST(request(command, "https://evil.test"))).status).toBe(403);
    expect((await POST(request({ ...command, enabled: ["unknown"] }))).status).toBe(400);
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("rejects non-consultants, unrelated and expired memberships", async () => {
    m.user.mockResolvedValueOnce({ data: { user: { email: "client@example.com", email_confirmed_at: "now" } } });
    expect((await POST(request(command))).status).toBe(403);
    m.member.mockResolvedValueOnce({ data: null }); expect((await POST(request(command))).status).toBe(403);
    m.draft.mockResolvedValueOnce({ data: { consultant_until: "2020-01-01" } }); expect((await POST(request(command))).status).toBe(403);
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("reads defaults without creating configuration", async () => {
    const response = await GET(new Request(`https://frota.test/api/consultoria/modulos?companyId=${companyId}`));
    expect(response.status).toBe(200); expect((await response.json()).revision).toBe(0); expect(m.insert).not.toHaveBeenCalled();
  });
  it("saves with actor and isolates optimistic updates to company and revision", async () => {
    expect((await POST(request(command))).status).toBe(200);
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: companyId, updated_by: "consultant", revision: 1 }));
    expect((await POST(request({ ...command, revision: 2 }))).status).toBe(200);
    expect(m.eq).toHaveBeenCalledWith("company_id", companyId); expect(m.eq).toHaveBeenCalledWith("revision", 2);
  });
  it("does not overwrite concurrent or ambiguous saves", async () => {
    m.write.mockResolvedValueOnce({ data: null, error: { code: "23505" } }); expect((await POST(request(command))).status).toBe(409);
    m.write.mockResolvedValueOnce({ data: null }); expect((await POST(request({ ...command, revision: 2 }))).status).toBe(409);
    m.write.mockResolvedValueOnce({ data: null, error: { code: "network" } }); expect((await POST(request(command))).status).toBe(503);
  });
});
