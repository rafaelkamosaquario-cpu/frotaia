import { beforeEach, describe, expect, it, vi } from "vitest";
const { access, rpc } = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: access }));
import { POST } from "./route";
const valid = { observationId:"10000000-0000-4000-8000-000000000001", recordId:"10000000-0000-4000-8000-000000000002", recordType:"fuel", confirmed:true, note:"Conferido no original" };
function request(body: unknown = valid, origin = "https://frota.test") { return new Request("https://frota.test/api/frota/grupos/revisao", { method:"POST", headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body) }); }
describe("revisão de mensagens por empresa", () => {
  beforeEach(() => { vi.resetAllMocks(); access.mockResolvedValue({ok:true,userId:"actor",company:{id:"trusted-company"},role:"admin"}); rpc.mockResolvedValue({data:{ok:true},error:null}); });
  it("usa empresa e usuário da sessão, nunca do formulário", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("link_group_observation", expect.objectContaining({p_company:"trusted-company",p_actor:"actor",p_record:valid.recordId}));
  });
  it.each(["viewer","operator"])("nega papel %s", async role => {access.mockResolvedValue({ok:true,role,company:{id:"c"}});expect((await POST(request())).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it("nega sessão ausente",async()=>{access.mockResolvedValue({ok:false});expect((await POST(request())).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it("nega origem externa",async()=>{expect((await POST(request(valid,"https://other.test"))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it.each([{companyId:"other"},{confirmed:false},{recordId:"invalid"},{note:""}])("rejeita comando adulterado %j",async patch=>{expect((await POST(request({...valid,...patch}))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
  it("respeita módulo financeiro desativado",async()=>{access.mockResolvedValue({ok:true,role:"owner",moduleConfig:{enabled:["grupos"]},company:{id:"c"}});expect((await POST(request())).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it("não confirma registro quando transação falha",async()=>{rpc.mockResolvedValue({error:{code:"23505"}});expect((await POST(request())).status).toBe(409);});
});
