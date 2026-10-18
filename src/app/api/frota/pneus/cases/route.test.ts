import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({access:vi.fn(),admin:vi.fn()}));
vi.mock("@/services/supabase/tireCaseAccess",()=>({tireCaseAccess:mocks.access}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import {GET,POST} from "./route";
import {GET as pdf} from "./pdf/route";
import {GET as evidence} from "./evidence/route";
beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue(null);});
describe("isolamento dos acompanhamentos",()=>{
 it("lista não acessa banco sem autorização",async()=>{expect((await GET()).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("PDF e fotos não são públicos",async()=>{expect((await pdf(new Request('https://f.test/api?id=00000000-0000-4000-8000-000000000001'))).status).toBe(403);expect((await evidence(new Request('https://f.test/api?caseId=00000000-0000-4000-8000-000000000001&id=00000000-0000-4000-8000-000000000001'))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("gravação rejeita origem externa antes do banco",async()=>{const r=await POST(new Request('https://f.test/api',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}));expect(r.status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("gravação rejeita sessão não autorizada",async()=>{expect((await POST(new Request('https://f.test/api',{method:'POST',headers:{origin:'https://f.test'},body:'{}'}))).status).toBe(403);expect(mocks.admin).not.toHaveBeenCalled();});
 it("dados inválidos não chegam à gravação",async()=>{mocks.access.mockResolvedValue({ok:true,company:{id:'adm'},userId:'owner'});expect((await POST(new Request('https://f.test/api',{method:'POST',headers:{origin:'https://f.test'},body:'{"data":{}}'}))).status).toBe(400);expect(mocks.admin).not.toHaveBeenCalled();});
});
