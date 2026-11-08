import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn(),channels:[] as Record<string,unknown>[],queries:[] as unknown[]}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:mocks.from})}));
import {GET} from "./route";
beforeEach(()=>{
 vi.clearAllMocks();mocks.queries=[];
 mocks.getUser.mockResolvedValue({data:{user:{id:"admin",email:"rafaelkamosaquario@gmail.com",email_confirmed_at:"yes"}}});
 mocks.channels=[{company_id:"company",user_id:"owner",phone_e164:"+554298582489"}];
 mocks.from.mockImplementation((table:string)=>{
  const result={data:table==="user_channels"?mocks.channels:table==="companies"?[{id:"company",name:"Minha operação"}]:[],error:null};
  const q:any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};
  for(const method of ["select","eq","in","order","limit"])q[method]=(...args:unknown[])=>{mocks.queries.push([table,method,...args]);return q;};
  return q;
 });
});
describe("busca Pix por variantes brasileiras",()=>{
 it("retorna telefone real salvo para a liberação sem reescrever identidade",async()=>{
  const r=await GET(new Request("https://example.test?phone=42998582489"));const d=await r.json();
  expect(r.status).toBe(200);expect(d.phone).toBe("+554298582489");expect(d.companies[0].id).toBe("company");
  expect(mocks.queries).toContainEqual(["user_channels","in","phone_e164",["+5542998582489","+554298582489"]]);
 });
 it("não escolhe pessoa diferente mesmo havendo correspondência exata",async()=>{
  mocks.channels.push({company_id:"another",user_id:"other",phone_e164:"+5542998582489"});
  const r=await GET(new Request("https://example.test?phone=42998582489"));expect(r.status).toBe(409);
  expect(mocks.from).toHaveBeenCalledTimes(1);
 });
 it("não confunde dois proprietários na mesma empresa",async()=>{
  mocks.channels.push({company_id:"company",user_id:"other",phone_e164:"+5542998582489"});
  expect((await GET(new Request("https://example.test?phone=42998582489"))).status).toBe(409);
 });
 it("mantém correspondência exata quando as duas variantes são da mesma pessoa",async()=>{
  mocks.channels.push({company_id:"company",user_id:"owner",phone_e164:"+5542998582489"});
  const d=await (await GET(new Request("https://example.test?phone=42998582489"))).json();expect(d.phone).toBe("+5542998582489");
 });
});
