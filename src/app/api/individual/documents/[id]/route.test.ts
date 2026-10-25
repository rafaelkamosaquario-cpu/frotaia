import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),doc:vi.fn(),sign:vi.fn()}));
vi.mock("@/services/supabase/individualAccess",()=>({individualAccess:m.access}));
vi.mock("@/services/supabase/generatedDocumentService",()=>({getGeneratedDocument:m.doc}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
vi.mock("@/lib/storage/generatedDocumentsStorage",()=>({createSignedGeneratedDocumentUrl:m.sign}));
import {GET} from "./route";
const run=()=>GET(new Request("https://test/api/individual/documents/d"),{params:Promise.resolve({id:"d"})});
describe("PDF individual",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({ok:true,client:{},company:{id:"c"},enabled:["gerados"]});});
 it("nega sessão ausente",async()=>{m.access.mockResolvedValue({ok:false,status:401});expect((await run()).status).toBe(401);expect(m.doc).not.toHaveBeenCalled();});
 it("nega módulo desativado",async()=>{m.access.mockResolvedValue({ok:true,enabled:[]});expect((await run()).status).toBe(403);});
 it("filtra documento pela empresa autenticada",async()=>{m.doc.mockResolvedValue(null);expect((await run()).status).toBe(404);expect(m.doc).toHaveBeenCalledWith({},"d","c");expect(m.sign).not.toHaveBeenCalled();});
 it("recusa caminho de outra empresa",async()=>{m.doc.mockResolvedValue({storage_path:"outra/generated/x.pdf"});expect((await run()).status).toBe(404);expect(m.sign).not.toHaveBeenCalled();});
 it("recusa arquivo ausente",async()=>{m.doc.mockResolvedValue({storage_path:null});expect((await run()).status).toBe(404);});
 it("assina somente caminho autorizado, sem cache",async()=>{m.doc.mockResolvedValue({storage_path:"c/generated/x.pdf",file_name:"x.pdf"});m.sign.mockResolvedValue("https://test/signed");const r=await run();expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toContain("no-store");expect((await r.json()).url).toBe("https://test/signed");});
});
