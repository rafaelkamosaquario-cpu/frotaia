import { beforeEach,describe,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),admin:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>{mocks.admin();return {rpc:mocks.rpc};}}));
import { POST,GET } from "./route";
const body={requestId:"10000000-0000-4000-8000-000000000001",companyId:"10000000-0000-4000-8000-000000000002",phone:"41997295836",plan:"INDIVIDUAL_MENSAL",reference:"123456789",amountCents:8990,paidAt:"2026-01-01T10:00:00Z",confirmed:true};
const req=(payload:unknown=body,origin="https://example.test")=>new Request("https://example.test/api/contratacoes-diretas",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(payload)});
beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:{id:"actor",email:"rafaelkamosaquario@gmail.com",email_confirmed_at:"2026-01-01"}}});mocks.rpc.mockResolvedValue({data:{id:body.requestId},error:null});});
describe("API de liberação Pix",()=>{
 it("bloqueia origem cruzada",async()=>{expect((await POST(req(body,"https://evil.test"))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("bloqueia cliente comum",async()=>{mocks.getUser.mockResolvedValue({data:{user:{email:"cliente@example.test",email_confirmed_at:"hoje"}}});expect((await POST(req())).status).toBe(403);expect((await GET(new Request("https://example.test"))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("rejeita email administrativo não confirmado",async()=>{mocks.getUser.mockResolvedValue({data:{user:{email:"rafaelkamosaquario@gmail.com"}}});expect((await POST(req())).status).toBe(403);});
 it("rejeita valor divergente sem gravar",async()=>{expect((await POST(req({...body,amountCents:90}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();});
 it("encaminha identidade do administrador autenticado",async()=>{expect((await POST(req())).status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith("confirm_direct_pix",expect.objectContaining({p_actor:"actor",p_phone:"+5541997295836",p_amount:8990,p_id:body.requestId}));});
 it("não confirma se transação falhar",async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:"22023",message:"Assinatura ativa incompatível."}});expect((await POST(req())).status).toBe(409);});
});
