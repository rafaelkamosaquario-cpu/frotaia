import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({access:vi.fn(),admin:vi.fn()}));
vi.mock("@/services/supabase/tireCaseAccess",()=>({tireCaseAccess:mocks.access}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import {GET,POST} from "./route";
const req=(body:unknown,origin="https://example.com")=>new Request("https://example.com/api/frota/pneus/mapeamento",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue(null);});
it("nega leitura e escrita sem ADM privado antes de acessar o banco",async()=>{expect((await GET()).status).toBe(403);expect((await POST(req({}))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
it("nega origem externa",async()=>{expect((await POST(req({},"https://other.com"))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
it("valida entrada sem gravar",async()=>{mocks.access.mockResolvedValue({company:{id:"a"},userId:"b"});expect((await POST(req({data:{tires:[]}}))).status).toBe(400);expect(mocks.admin).not.toHaveBeenCalled();});
it("não permite criar inventário com comando de movimentação",async()=>{mocks.access.mockResolvedValue({company:{id:"a"},userId:"b"});mocks.admin.mockReturnValue({});expect((await POST(req({id:crypto.randomUUID(),version:0,command:{type:"move",tireId:crypto.randomUUID(),date:"2026-10-01",km:null,reason:"Teste",destination:"estoque",vehicleId:null,position:null}}))).status).toBe(400);});

