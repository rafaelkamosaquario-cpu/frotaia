import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsultant } from "@/lib/frota/consultancy";
import { DIRECT_PLANS } from "@/lib/mercadopago/directSales";

const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!isConsultant(user))return reply({error:"Acesso restrito ao administrador."},403);
  const params=new URL(request.url).searchParams;
  const plan=params.get("plan")||"";
  const page=Number(params.get("page")||"1");
  if(!Number.isSafeInteger(page)||page<1||(plan&&!(DIRECT_PLANS as readonly string[]).includes(plan)))return reply({error:"Filtro inválido."},400);
  const admin=createAdminClient();
  // Read every page: a renewal must not hide an older customer's first payment.
  const latest=new Map<string,{company_id:string;phone:string;plan:string;paid_at:string;access_until:string}>();
  for(let start=0;;start+=500){
    const {data,error}=await admin.from("direct_pix_payments").select("company_id,phone,plan,paid_at,access_until").order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,start+499);
    if(error)return reply({error:"Não foi possível consultar as contratações manuais."},503);
    for(const row of data??[])if(!latest.has(row.company_id))latest.set(row.company_id,row);
    if(!data||data.length<500)break;
  }
  const filtered=[...latest.values()].filter(row=>!plan||row.plan===plan);
  const rows=filtered.slice((page-1)*25,page*25);
  if(!rows.length)return reply({customers:[],total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/25))});
  const ids=rows.map(row=>row.company_id);
  const [companies,subscriptions]=await Promise.all([
    admin.from("companies").select("id,name").in("id",ids),
    admin.from("subscriptions").select("company_id,plan,status,valido_ate").in("company_id",ids),
  ]);
  if(companies.error||subscriptions.error)return reply({error:"Não foi possível conferir os cadastros e assinaturas."},503);
  return reply({customers:rows.map(row=>({...row,name:companies.data?.find(c=>c.id===row.company_id)?.name??"Cadastro indisponível",subscription:subscriptions.data?.find(s=>s.company_id===row.company_id)??null})),total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/25))});
}
