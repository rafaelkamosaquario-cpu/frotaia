import {CATALOGO_OFERTAS} from "./catalog";
import {DIRECT_PLANS,type DirectPlan} from "./directSales";
export type DirectReceipt={id:string;company_id:string;reference:string;plan:string;amount_cents:number;access_until:string};
export type DirectSubscription={plan:string;status:string;valido_ate:string|null;hasProviderLink:boolean};
export function canShareRelease(receipt:DirectReceipt,companyId:string,subscription:DirectSubscription|null,now=Date.now()){
 return receipt.company_id===companyId && subscription?.status==="ATIVA" && subscription.plan===receipt.plan &&
  Date.parse(receipt.access_until)>now && (!subscription.valido_ate||Date.parse(subscription.valido_ate)>now) &&
  (DIRECT_PLANS as readonly string[]).includes(receipt.plan);
}
export function directReleaseMessage(receipt:DirectReceipt,phone:string) {
 if(!(DIRECT_PLANS as readonly string[]).includes(receipt.plan))throw new Error("Plano desconhecido.");
 const offer=CATALOGO_OFERTAS[receipt.plan as DirectPlan];
 const end=new Date(receipt.access_until).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
 return "Pagamento confirmado! Seu "+offer.label+" está liberado.\n\nWhatsApp de uso: "+phone+"\nAcesso deste pagamento até "+end+" (horário de Brasília).\n\nVocê já pode usar o Frota IA pelo WhatsApp. Abra https://wa.me/5541997454382 e envie Olá. Se faltar alguma informação do cadastro, o assistente continuará de onde você parou.\n\n"+
  (offer.painel?"O painel segue a configuração contratada com o atendimento.":"O aplicativo é opcional e contratado separadamente por R$ 9,90 por mês. Este pagamento libera o plano WhatsApp.")+
  "\n\nRenovação mediante novo pagamento confirmado, sem cobrança automática.";
}
