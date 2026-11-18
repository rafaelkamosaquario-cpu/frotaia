import {NextResponse} from "next/server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {isConsultant,sameOrigin} from "@/lib/frota/consultancy";
import {addonDb,getAppAddonState} from "@/services/supabase/appAddonService";
import {normalizeDirectPhone,directPhoneVariants,pixReferencePattern} from "@/lib/mercadopago/directSales";
const schema=z.object({companyId:z.string().uuid(),phone:z.string(),reference:z.string().trim().toUpperCase().regex(pixReferencePattern),amountCents:z.literal(990),paidAt:z.string().datetime({offset:true}),confirmed:z.literal(true)}).strict();
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!isConsultant(user))return reply({error:"Acesso restrito."},403);
 const id=new URL(request.url).searchParams.get("companyId");
 if(!z.string().uuid().safeParse(id).success)return reply({error:"Empresa inválida."},400);
 try{
  const state=await getAppAddonState(id!);
  const {data,error}=await addonDb().from("individual_app_payments").select("id,reference,status,access_until,source").eq("company_id",id!).order("created_at",{ascending:false}).limit(30);
  if(error)throw error;
  return reply({state,history:data});
 }catch{return reply({error:"Não foi possível consultar o adicional."},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return reply({error:"Origem inválida."},403);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user||!isConsultant(user))return reply({error:"Somente o administrador pode confirmar recebimento."},403);
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||!normalizeDirectPhone(parsed.data.phone)||Date.parse(parsed.data.paidAt)>Date.now())return reply({error:"Confira os dados e o valor recebido de R$ 9,90."},400);
 const c=parsed.data,admin=addonDb();
 try{
  const {data:channels,error}=await admin.from("user_channels").select("company_id,user_id,phone_e164").in("phone_e164",directPhoneVariants(c.phone)).eq("active",true).eq("channel_type","whatsapp");
  if(error)throw error;
  const ids=new Set((channels??[]).map(r=>r.company_id+":"+r.user_id));
  const channel=channels?.find(r=>r.company_id===c.companyId);
  if(ids.size!==1||!channel)return reply({error:"Vínculo ambíguo ou diferente. Confira o cadastro."},409);
  const state=await getAppAddonState(c.companyId);
  if(state.preserved)return reply({error:"Aplicativo já incluído. Não cobre adicional."},409);
  const {data,error:saveError}=await admin.rpc("confirm_individual_app_payment",{p_company:c.companyId,p_source:"manual",p_reference:c.reference,p_amount:c.amountCents,p_paid_at:c.paidAt,p_status:"approved",p_actor:user.id,p_phone:channel.phone_e164});
  if(saveError)return reply({error:["22023","23505","42501"].includes(saveError.code)?saveError.message:"Liberação não confirmada. Tente novamente com a mesma referência."},409);
  return reply({receipt:data});
 }catch{return reply({error:"Consulta indisponível; nenhum acesso confirmado."},503);}
}
