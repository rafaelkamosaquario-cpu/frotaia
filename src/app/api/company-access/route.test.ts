import { beforeEach,describe,it,expect,vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),from:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.user},rpc:m.rpc,from:m.from})}));
import { GET,POST } from "./route";
const id="10000000-0000-4000-8000-000000000001";
const req=(body:unknown,origin="https://frota.test")=>new Request("https://frota.test/api/company-access",{method:"POST",headers:{origin},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:"user",email:"a@example.com"}}});m.rpc.mockResolvedValue({data:{companies:[],invites:[]},error:null});const chain={select:m.select,eq:m.eq,maybeSingle:m.single};[m.from,m.select,m.eq].forEach(f=>f.mockReturnValue(chain));m.single.mockResolvedValue({data:{id},error:null});});
describe("company access API",()=>{
 it("requires authentication",async()=>{m.user.mockResolvedValue({data:{user:null}});expect((await GET(req(null))).status).toBe(401);expect((await POST(req({action:"select",company_id:id}))).status).toBe(401);expect(m.rpc).not.toHaveBeenCalled();});
 it.each(["", "null", "https://attacker.test"])("rejects origin %s",async origin=>{expect((await POST(req({action:"select",company_id:id},origin))).status).toBe(403);expect(m.from).not.toHaveBeenCalled();});
 it("supports forwarded host behind the production proxy",async()=>{const r=req({action:"select",company_id:id},"https://public.test");r.headers.set("x-forwarded-host","public.test");expect((await POST(r)).status).toBe(200);});
 it("selects only active authenticated membership without changing defaults",async()=>{const r=await POST(req({action:"select",company_id:id}));expect(r.status).toBe(200);expect(m.eq.mock.calls).toEqual([["company_id",id],["user_id","user"],["status","active"]]);expect(r.headers.get("set-cookie")).toContain("HttpOnly");expect(m.rpc).not.toHaveBeenCalled();});
 it("does not set cookie for unauthorized company",async()=>{m.single.mockResolvedValue({data:null,error:null});const r=await POST(req({action:"select",company_id:id}));expect(r.status).toBe(403);expect(r.headers.get("set-cookie")).toBeNull();});
 it("validates role and refuses privilege injection",async()=>{expect((await POST(req({action:"invite",company_id:id,email:"a@b.com",role:"owner"}))).status).toBe(400);expect(m.rpc).not.toHaveBeenCalled();});
 it("delegates email acceptance to authenticated database RPC",async()=>{expect((await POST(req({action:"accept",invite_id:id}))).status).toBe(200);expect(m.rpc).toHaveBeenCalledWith("accept_company_access",{p_invite:id});});
 it("protects team listing and exposes no internal error",async()=>{m.rpc.mockResolvedValue({data:null,error:{code:"42501",message:"internal"}});const r=await GET(new Request(`https://frota.test/api/company-access?company_id=${id}`));expect(r.status).toBe(403);expect(await r.text()).not.toContain("internal");});
});
