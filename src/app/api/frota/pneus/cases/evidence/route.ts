import {NextResponse} from "next/server";
import {z} from "zod";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {createAdminClient} from "@/lib/supabase/admin";
import {sameOrigin} from "@/lib/frota/consultancy";
const bucket="consultant-tire-evidence";
async function context(caseId:string){
 const access=await tireCaseAccess(); if(!access||!z.string().uuid().safeParse(caseId).success)return null;
 const db=createAdminClient(); const {data}=await db.from("consultant_tire_cases").select("id").eq("id",caseId).eq("company_id",access.company.id).eq("actor_id",access.userId).maybeSingle();
 return data?{db,prefix:`${access.company.id}/${access.userId}/${caseId}`}:null;
}
export async function POST(request:Request){
 if(!sameOrigin(request))return NextResponse.json({error:"Origem inválida."},{status:403});
 if(Number(request.headers.get("content-length"))>5500000)return NextResponse.json({error:"Limite: 5 MB."},{status:413});
 const form=await request.formData(); const ctx=await context(String(form.get("caseId"))); if(!ctx)return NextResponse.json({error:"Sem acesso ao registro."},{status:403});
 const file=form.get("file"); if(!(file instanceof File)||file.size>5242880||file.size===0)return NextResponse.json({error:"Envie JPG ou PNG até 5 MB."},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 if(!jpeg&&!png)return NextResponse.json({error:"A evidência precisa ser uma foto JPG ou PNG."},{status:400});
 const id=crypto.randomUUID();const {error}=await ctx.db.storage.from(bucket).upload(`${ctx.prefix}/${id}`,bytes,{contentType:jpeg?"image/jpeg":"image/png",upsert:false});
 return error?NextResponse.json({error:"Não foi possível guardar a foto."},{status:503}):NextResponse.json({id});
}
export async function GET(request:Request){
 const url=new URL(request.url),id=url.searchParams.get("id");const ctx=await context(url.searchParams.get("caseId")??"");
 if(!ctx||!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Sem acesso."},{status:403});
 const {data,error}=await ctx.db.storage.from(bucket).createSignedUrl(`${ctx.prefix}/${id}`,60);
 if(error||!data)return NextResponse.json({error:"Foto indisponível."},{status:404});
 return NextResponse.redirect(data.signedUrl,{headers:{"Cache-Control":"private, no-store"}});
}
