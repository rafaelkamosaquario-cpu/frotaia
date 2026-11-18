import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn(),rows:[] as Record<string,unknown>[],fail:false,ranges:[] as number[]}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.getUser}})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:m.from})}));
import {GET} from "./route";
beforeEach(()=>{vi.clearAllMocks();m.fail=false;m.ranges=[];m.rows=[];m.getUser.mockResolvedValue({data:{user:{email:"rafaelkamosaquario@gmail.com",email_confirmed_at:"yes"}}});m.from.mockImplementation((table:string)=>{
 let start=0,end=499;
 const q:any={select:()=>q,order:()=>q,in:()=>q,range:(a:number,b:number)=>{start=a;end=b;m.ranges.push(a);return q;},then:(resolve:any)=>Promise.resolve({data:table==="direct_pix_payments"?m.rows.slice(start,end+1):[],error:m.fail?{}:null}).then(resolve)};return q;
});});
const req=(q="")=>new Request("https://example.test/api/contratacoes-diretas/clientes"+q);
it("denies customer accounts before any privileged query",async()=>{m.getUser.mockResolvedValue({data:{user:{email:"client@example.com",email_confirmed_at:"yes"}}});expect((await GET(req())).status).toBe(403);expect(m.from).not.toHaveBeenCalled();});
it("rejects invalid filters",async()=>{expect((await GET(req("?page=-1"))).status).toBe(400);expect((await GET(req("?plan=OTHER"))).status).toBe(400);expect(m.from).not.toHaveBeenCalled();});
it("deduplicates renewals and reads beyond the first database page",async()=>{m.rows=Array.from({length:500},()=>({company_id:"a",phone:"+5542998006380",plan:"INDIVIDUAL_MENSAL"}));m.rows.push({company_id:"b",phone:"+5542998582489",plan:"INDIVIDUAL_ANUAL"});const data=await(await GET(req())).json();expect(data.total).toBe(2);expect(m.ranges).toEqual([0,500]);expect(data.customers).toHaveLength(2);});
it("filters on latest manual plan rather than an obsolete renewal",async()=>{m.rows=[{company_id:"a",plan:"INDIVIDUAL_ANUAL"},{company_id:"a",plan:"INDIVIDUAL_MENSAL"}];expect((await(await GET(req("?plan=INDIVIDUAL_MENSAL"))).json()).total).toBe(0);});
it("does not return partial data when storage fails",async()=>{m.fail=true;expect((await GET(req())).status).toBe(503);});
