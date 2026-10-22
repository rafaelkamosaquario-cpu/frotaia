import {beforeEach, describe, expect, it, vi} from "vitest";
const m = vi.hoisted(() => ({access: vi.fn(), db: vi.fn()}));
vi.mock("@/services/supabase/nfcAccess", () => ({nfcAccess: m.access}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: m.db}));
import {GET, POST} from "./route";
const companyId = "11111111-1111-4111-8111-111111111111";
const request = (body: object, origin = "https://frotaia.up.railway.app") => new Request("https://frotaia.up.railway.app/api/frota/nfc", {method: "POST", headers: {origin}, body: JSON.stringify(body)});
describe("NFC authorization and scope", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("denies unauthorised reads without touching service-role DB", async () => {
    m.access.mockResolvedValue(null);
    expect((await GET()).status).toBe(403); expect(m.db).not.toHaveBeenCalled();
  });
  it("denies cross-origin writes", async () => {
    expect((await POST(request({}, "https://other.example"))).status).toBe(403);
    expect(m.db).not.toHaveBeenCalled();
  });
  it("denies unauthorised writes", async () => {
    m.access.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(403); expect(m.db).not.toHaveBeenCalled();
  });
  it("rejects changed company before any write", async () => {
    m.access.mockResolvedValue({company: {id: "22222222-2222-4222-8222-222222222222"}});
    expect((await POST(request({companyId, action: "create", kind: "pump", vehicleId: null, label: "Bomba", physicalCode: ""}))).status).toBe(409);
    expect(m.db).not.toHaveBeenCalled();
  });
  it("rejects malformed commands", async () => {
    m.access.mockResolvedValue({company: {id: companyId}});
    expect((await POST(request({action: "create"}))).status).toBe(400);
    expect(m.db).not.toHaveBeenCalled();
  });
});
