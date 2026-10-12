import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsultant, sameOrigin } from "@/lib/frota/consultancy";
import { directPaymentCommand, normalizeDirectPhone } from "@/lib/mercadopago/directSales";
const reply = (data:unknown,status=200) => NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request) {
 const db=await createClient(); const {data:{user}}=await db.auth.getUser();
 if(!isConsultant(user)) return reply({error:"Acesso restrito ao administrador."},403);
 const phone=normalizeDirectPhone(new URL(request.url).searchParams.get("phone")??"");
 if(!phone) return reply({error:"Informe o WhatsApp com DDD."},400);
 const admin=createAdminClient();
 const {data:channels,error}=await admin.from("user_channels").select("company_id,user_id,display_name").eq("phone_e164",phone).eq("active",true).eq("channel_type","whatsapp");
 if(error) return reply({error:"Consulta indisponível."},503);
 const ids=[...new Set((channels??[]).map(c=>c.company_id).filter((id):id is string=>!!id))];
 if(!ids.length) return reply({phone,companies:[]});
 const [companies,subscriptions,history]=await Promise.all([
  admin.from("companies").select("id,name,fleet_panel_enabled").in("id",ids),
  admin.from("subscriptions").select("company_id,plan,status,valido_ate,mercadopago_subscription_id,mercadopago_payment_id").in("company_id",ids),
  admin.from("direct_pix_payments").select("id,company_id,plan,reference,amount_cents,paid_at,access_until").in("company_id",ids).order("created_at",{ascending:false}).limit(50)
 ]);
 if(companies.error||subscriptions.error||history.error) return reply({error:"Consulta incompleta. Verifique a migração da contratação direta. Não libere o pagamento."},503);
 return reply({phone,history:history.data,companies:(companies.data??[]).map(c=>{
  const s=subscriptions.data?.find(s=>s.company_id===c.id);
  return {...c,subscription:s?{plan:s.plan,status:s.status,valido_ate:s.valido_ate,hasProviderLink:!!(s.mercadopago_subscription_id||s.mercadopago_payment_id)}:null};
 })});
}
export async function POST(request:Request) {
 if(!sameOrigin(request)) return reply({error:"Origem inválida."},403);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user||!isConsultant(user))return reply({error:"Acesso restrito ao administrador."},403);
 const parsed=directPaymentCommand.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return reply({error:"Confira plano, valor exato, data, telefone e confirmação de recebimento."},400);
 const c=parsed.data;const admin=createAdminClient();
 const result=await admin.rpc("confirm_direct_pix",{p_actor:user.id,p_id:c.requestId,p_company:c.companyId,p_phone:c.phone!,p_plan:c.plan,p_reference:c.reference,p_amount:c.amountCents,p_paid_at:c.paidAt});
 if(result.error)return reply({error:["22023","23505","42501"].includes(result.error.code)?result.error.message:"Liberação não confirmada. Verifique a implantação e tente novamente com os mesmos dados e referência."},409);
 return reply({receipt:result.data});
}
