import { beforeEach, describe, expect, it, vi } from "vitest";
const { access, rpc } = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: access }));
import { GET, POST } from "./route";
const command = { action: "save", id: "00000000-0000-4000-8000-000000000001", name: "Pesagem TR", purpose: "pesagem", notes: "" };
const post = (body: unknown, origin = "https://example.com") => POST(new Request("https://example.com/api/frota/grupos", { method: "POST", headers: { origin }, body: JSON.stringify(body) }));
describe("operational group preparation", () => {
  beforeEach(() => { vi.clearAllMocks(); access.mockResolvedValue({ ok: true, role: "admin", company: { id: "selected-company" } }); rpc.mockResolvedValue({ data: [], error: null }); });
  it("lists only selected company", async () => { expect((await GET()).status).toBe(200); expect(rpc).toHaveBeenCalledWith("manage_operational_groups", {p_company:"selected-company",p_action:"list"}); });
  it("does not accept unauthenticated users", async () => { access.mockResolvedValue({ok:false,reason:"unauthenticated"}); expect((await GET()).status).toBe(401); expect(rpc).not.toHaveBeenCalled(); });
  it.each(["viewer","operator"])("denies group administration to %s",async role=>{ access.mockResolvedValue({ok:true,role,company:{id:"selected-company"}}); expect((await post(command)).status).toBe(403); expect(rpc).not.toHaveBeenCalled(); });
  it("rejects foreign origins",async()=>{expect((await post(command,"https://attacker.example")).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it.each([{companyId:"other"},{active:true},{groupId:"123-group"},{purpose:"radar"}])("rejects scope overrides or activation fields %j",async extra=>{expect((await post({...command,...extra})).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
  it("saves only preparation metadata",async()=>{expect((await post(command)).status).toBe(200);expect(rpc).toHaveBeenCalledWith("manage_operational_groups",{p_company:"selected-company",p_action:"save",p_payload:command});});
  it("archives without deleting",async()=>{const payload={action:"archive",id:command.id,archived:true};expect((await post(payload)).status).toBe(200);expect(rpc).toHaveBeenCalledWith("manage_operational_groups",expect.objectContaining({p_action:"archive",p_payload:payload}));});
  it("reports missing deployment instead of an empty list",async()=>{rpc.mockResolvedValue({error:{code:"PGRST202"}});expect((await GET()).status).toBe(503);});
  it("reports duplicates",async()=>{rpc.mockResolvedValue({error:{code:"23505"}});expect((await post(command)).status).toBe(409);});
});
