import {beforeEach,expect,it,vi} from "vitest";
import {PDFDocument} from "pdf-lib";
const access=vi.hoisted(()=>vi.fn());
vi.mock("@/services/supabase/tireCaseAccess",()=>({tireCaseAccess:access}));
import {GET} from "./route";
beforeEach(()=>access.mockResolvedValue({userId:"adm"}));
it("nega acesso sem autorização privada, mesmo com modelo válido",async()=>{
 access.mockResolvedValue(null);
 expect((await GET(new Request("https://example.com?modelo=cavalo-tracao"))).status).toBe(403);
});
it("rejeita nomes fora da lista permitida",async()=>{
 for(const model of ["", "../../.env", "constructor", "toString"]){
  expect((await GET(new Request(`https://example.com?modelo=${encodeURIComponent(model)}`))).status).toBe(400);
 }
});
it.each(["cavalo-tracao","carreta-tanque"])("entrega PDF privado válido: %s",async model=>{
 const response=await GET(new Request(`https://example.com?modelo=${model}`));
 expect(response.status).toBe(200);
 expect(response.headers.get("Cache-Control")).toBe("private, no-store");
 expect(response.headers.get("Content-Disposition")).toContain("inline;");
 const pdf=await PDFDocument.load(await response.arrayBuffer());
 expect(pdf.getPageCount()).toBe(1);
});
it("permite baixar como anexo sem mudar o documento",async()=>{
 const response=await GET(new Request("https://example.com?modelo=carreta-tanque&download=1"));
 expect(response.headers.get("Content-Disposition")).toContain("attachment;");
});
