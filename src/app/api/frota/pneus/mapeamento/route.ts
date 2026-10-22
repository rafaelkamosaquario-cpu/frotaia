import {NextResponse} from "next/server";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {sameOrigin} from "@/lib/frota/consultancy";
import {applyCommand,commandSchema,customerSchema,emptyInventory} from "@/lib/frota/tireInventory";
export const dynamic="force-dynamic";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(){
 const a=await tireCaseAccess();if(!a)return reply({error:"Área exclusiva do administrador."},403);
 const db=createAdminClient();
 const [inv,cases]=await Promise.all([
  db.from("consultant_tire_inventory").select("*").eq("company_id",a.company.id).eq("actor_id",a.userId).order("updated_at",{ascending:false}),
  db.from("consultant_tire_cases").select("*").eq("company_id",a.company.id).eq("actor_id",a.userId)
 ]);
 if(inv.error||cases.error)return reply({error:"Mapeamento ainda indisponível. A estrutura privada precisa estar ativada no banco."},503);
 const rows=inv.data.map(row=>{const source=cases.data.find(c=>c.id===row.source_case_id);return source?{...row,data:{...row.data,customer:source.data.client}}:row;});
 return reply({rows,customers:cases.data.map(c=>({id:c.id,customer:c.data.client}))});
}
const bodySchema=z.object({id:z.string().uuid(),version:z.number().int().min(0),sourceCaseId:z.string().uuid().nullable().optional(),command:commandSchema}).strict();
export async function POST(req:Request){
 if(!sameOrigin(req))return reply({error:"Origem inválida."},403);
 const a=await tireCaseAccess();if(!a)return reply({error:"Área exclusiva do administrador."},403);
 const raw=await req.text();if(raw.length>100000)return reply({error:"Lote muito grande."},413);
 let b;try{b=bodySchema.parse(JSON.parse(raw));}catch{return reply({error:"Revise os campos obrigatórios e as datas."},400);}
 const db=createAdminClient();
 let sourceId:string|null=null;
 let state;
 if(b.version===0){
  if(b.command.type!=="customer")return reply({error:"Cadastre o cliente primeiro."},400);
  let customer=customerSchema.parse(b.command.customer);
  sourceId=b.sourceCaseId??null;
  if(sourceId){
   const {data,error}=await db.from("consultant_tire_cases").select("*").eq("id",sourceId).eq("company_id",a.company.id).eq("actor_id",a.userId).maybeSingle();
   if(error)return reply({error:"Não foi possível consultar o cadastro."},503);
   if(!data)return reply({error:"Cliente não encontrado."},404);
   customer=data.data.client;
  }
  state=emptyInventory(customer);
 }else{
  const {data,error}=await db.from("consultant_tire_inventory").select("*").eq("id",b.id).eq("company_id",a.company.id).eq("actor_id",a.userId).maybeSingle();
  if(error)return reply({error:"Consulta indisponível."},503);
  if(!data)return reply({error:"Cadastro não encontrado."},404);
  if(data.version!==b.version)return reply({error:"Outra aba alterou este cadastro. Recarregue antes de continuar."},409);
  sourceId=data.source_case_id;
  if(sourceId&&b.command.type==="customer")return reply({error:"Edite este cliente no acompanhamento original."},400);
  try{state=applyCommand(data.data,b.command);}catch(e){return reply({error:e instanceof Error?e.message:"Operação inválida."},400);}
 }
 const row={company_id:a.company.id,actor_id:a.userId,source_case_id:sourceId,version:b.version+1,data:state,updated_at:new Date().toISOString()};
 const q=b.version===0?db.from("consultant_tire_inventory").insert({...row,id:b.id}):db.from("consultant_tire_inventory").update(row).eq("id",b.id).eq("company_id",a.company.id).eq("actor_id",a.userId).eq("version",b.version);
 const {data,error}=await q.select().maybeSingle();
 if(error||!data)return reply({error:error?.code==="23505"||!error?"Cadastro já existe ou foi alterado. Recarregue.":"Não foi possível salvar. Nenhuma confirmação foi emitida."},error?.code==="23505"||!error?409:503);
 return reply({row:data},b.version===0?201:200);
}

