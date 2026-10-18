import {NextResponse} from "next/server";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {caseSchema} from "@/lib/frota/tireCases";
import {sameOrigin} from "@/lib/frota/consultancy";
export const dynamic="force-dynamic";
export async function GET(){
 const access=await tireCaseAccess(); if(!access) return NextResponse.json({error:"Área exclusiva do administrador."},{status:403});
 const {data,error}=await createAdminClient().from("consultant_tire_cases").select("*").eq("company_id",access.company.id).eq("actor_id",access.userId).order("updated_at",{ascending:false});
 if(error) return NextResponse.json({error:"Acompanhamento indisponível. Verifique a ativação da estrutura privada."},{status:503});
 return NextResponse.json({cases:data},{headers:{"Cache-Control":"private, no-store"}});
}
export async function POST(request:Request){
 if(!sameOrigin(request)) return NextResponse.json({error:"Origem inválida."},{status:403});
 const access=await tireCaseAccess(); if(!access) return NextResponse.json({error:"Sem permissão."},{status:403});
 const raw=await request.text(); if(raw.length>400000) return NextResponse.json({error:"Registro muito grande."},{status:413});
 let parsed; try {parsed=z.object({id:z.string().uuid(),version:z.number().int().min(0),data:caseSchema}).strict().parse(JSON.parse(raw));}
 catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues.map(i=>i.message).join(" "):"Dados inválidos."},{status:400});}
 const db=createAdminClient();
 const row={company_id:access.company.id,actor_id:access.userId,data:parsed.data,version:parsed.version+1,updated_at:new Date().toISOString()};
 const query=parsed.version===0?db.from("consultant_tire_cases").insert({...row,id:parsed.id}):db.from("consultant_tire_cases").update(row).eq("id",parsed.id).eq("company_id",access.company.id).eq("actor_id",access.userId).eq("version",parsed.version);
 const {data,error}=await query.select().maybeSingle();
 if(error||!data) return NextResponse.json({error:error?.code==="23505"||!error?"Registro alterado em outra aba ou já salvo. Recarregue antes de editar.":"Não foi possível salvar o acompanhamento."},{status:error?.code==="23505"||!error?409:503});
 return NextResponse.json({case:data},{status:parsed.version===0?201:200});
}
