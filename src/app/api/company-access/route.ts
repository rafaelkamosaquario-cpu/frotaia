import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { accessCommand } from "@/lib/frota/companyAccess";
import { COMPANY_COOKIE } from "@/lib/frota/companyScope";
function failure(code?:string) {
 const status=code==="42501"?403:code==="23505"?409:code==="23514"?422:503;
 return NextResponse.json({error:status===403?"Acesso não autorizado para esta conta. Somente o proprietário gerencia a equipe.":status===409?"Registro já existente ou alterado. Atualize a lista.":status===422?"Convite expirado, revogado ou ação não permitida. Confira com o proprietário.":"Gestão de acessos indisponível. Nenhuma alteração foi confirmada."},{status});
}
export async function GET(request:Request) {
 const db=await createClient(); const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Entre com sua conta Google."},{status:401});
 const company=new URL(request.url).searchParams.get("company_id");
 if(company&&!z.string().uuid().safeParse(company).success)return NextResponse.json({error:"Empresa inválida."},{status:400});
 const result=company?await db.rpc("manage_company_access",{p_company:company,p_action:"list"}):await db.rpc("list_company_access",{});
 if(result.error)return failure(result.error.code);
 return NextResponse.json({data:result.data,email:user.email},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
 try {
  const origin=new URL(request.headers.get("origin")??"");
  const host=request.headers.get("x-forwarded-host")??request.headers.get("host")??new URL(request.url).host;
  if(!["https:","http:"].includes(origin.protocol)||origin.host!==host)throw new Error();
 } catch { return NextResponse.json({error:"Origem inválida."},{status:403}); }
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Entre com sua conta Google."},{status:401});
 const parsed=accessCommand.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Confira os dados informados."},{status:400});
 const c=parsed.data;
 if(c.action==="select") {
  const {data,error}=await db.from("company_members").select("id").eq("company_id",c.company_id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(error)return failure();if(!data)return failure("42501");
  const response=NextResponse.json({ok:true});
  response.cookies.set(COMPANY_COOKIE,c.company_id,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
  return response;
 }
 const result=c.action==="accept"?await db.rpc("accept_company_access",{p_invite:c.invite_id})
  :await db.rpc("manage_company_access",{p_company:c.company_id,p_action:c.action,...(c.action==="invite"?{p_email:c.email,p_role:c.role}:{p_id:c.id})});
 if(result.error)return failure(result.error.code);
 return NextResponse.json({ok:true});
}
