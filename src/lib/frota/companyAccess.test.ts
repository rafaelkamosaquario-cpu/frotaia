import { describe,it,expect,vi } from "vitest";
import { accessCommand } from "./companyAccess";
import { attachCompanyScope,companyScope,requestCompanyScope,scopedCompanyFetch,COMPANY_HEADER } from "./companyScope";
const id="11111111-1111-4111-8111-111111111111";
describe("company access",()=>{
 it("normalizes invited email, rejects ownership and extra fields",()=>{
  const input={action:"invite",company_id:id,email:"  Consultor@Example.COM ",role:"admin"};
  expect(accessCommand.parse(input)).toMatchObject({email:"consultor@example.com"});
  expect(accessCommand.safeParse({...input,role:"owner"}).success).toBe(false);
  expect(accessCommand.safeParse({...input,is_default:true}).success).toBe(false);
 });
 it("requires explicit valid identifiers",()=>{
  expect(accessCommand.safeParse({action:"select",company_id:id}).success).toBe(true);
  expect(accessCommand.safeParse({action:"select",company_id:"anything"}).success).toBe(false);
  expect(accessCommand.safeParse({action:"accept",invite_id:id,company_id:id}).success).toBe(false);
 });
 it("isolates request clients and preserves default context without selection",()=>{
  const panel={},whatsapp={};attachCompanyScope(panel,id);
  expect(companyScope(panel)).toBe(id);expect(companyScope(whatsapp)).toBeUndefined();
 });
 it("fails closed for malformed or empty selection",()=>{
  const client={};attachCompanyScope(client,"");
  expect(companyScope(client)).toBe("00000000-0000-0000-0000-000000000000");
 });
 it("keeps checkout, linking and WhatsApp out of the panel cookie scope",()=>{
  for(const path of ["/api/whatsapp/webhook","/auth/account/link","/api/auth/account/confirm","/assinar","/api/company-access"])expect(requestCompanyScope(path,id,id)).toBeUndefined();
  expect(requestCompanyScope("/api/chat",null,id)).toBeNull();
  expect(requestCompanyScope("/frota/dashboard",null,id)).toBe(id);
  expect(requestCompanyScope("/api/frota/veiculos","pinned",id)).toBe("pinned");
 });
 it("pins writes and RSC requests to visible tenant without leaking to providers",async()=>{
  const original=vi.fn<typeof fetch>().mockResolvedValue(new Response());
  const scoped=scopedCompanyFetch(original,id,"https://frota.test/frota/dashboard");
  for(const url of ["/api/frota/veiculos","/frota/dashboard?_rsc=1","/frota-ativacao","/api/chat"]){
   await scoped(url,{method:"POST",body:"{}",headers:{"content-type":"application/json"}});
   const options=original.mock.lastCall?.[1];expect(new Headers(options?.headers).get(COMPANY_HEADER)).toBe(id);expect(options?.body).toBe("{}");
  }
  for(const url of ["https://provider.test/api/frota/veiculos","/api/company-access","/auth/account/link"]){await scoped(url);expect(original.mock.lastCall?.[1]).toBeUndefined();}
 });
});
