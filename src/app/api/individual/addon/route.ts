import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadCustomerContext } from "@/ai/context/customerContext";
import { sameOrigin } from "@/lib/frota/consultancy";
import { getAppAddonState } from "@/services/supabase/appAddonService";
import { criarPagamentoAdicional } from "@/lib/mercadopago/client";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request:Request) {
 if(!sameOrigin(request))return reply({error:"Origem inválida."},403);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return reply({error:"Entre com sua conta vinculada ao WhatsApp."},401);
 const context=await loadCustomerContext(db,user.id);
 if(!context.company || !["owner","admin"].includes(context.role??""))return reply({error:"Vincule sua conta à operação."},403);
 const body=await request.json().catch(()=>null);
 if(!["pix","credito"].includes(body?.method))return reply({error:"Escolha Pix ou cartão."},400);
 try {
  const state=await getAppAddonState(context.company.id);
  if(!state.baseActive)return reply({error:"Ative primeiro o plano WhatsApp."},409);
  if(state.preserved)return reply({error:"Seu acesso ao aplicativo já está incluído. Não é necessário pagar adicional."},409);
  const result=await criarPagamentoAdicional(context.company.id,body.method);
  return reply({url:result.initPoint});
 }catch{return reply({error:"Não foi possível gerar a cobrança. Nenhum acesso foi alterado. Tente novamente ou fale com Rafael."},503);}
}
