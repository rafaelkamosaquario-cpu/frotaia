import { CATALOGO_OFERTAS, formatarReais } from "./catalog";
import { DIRECT_PLANS, type DirectPlan } from "./directSales";

// Recipient data supplied by the administrator. This is a static Pix payload,
// not a Mercado Pago API payment, receipt, or automatic subscription.
export const MANUAL_PIX_KEY = "+5541997295836";
export const MANUAL_PIX_NAME = "Frotaia Assistente";
function field(id: string, value: string) {
  if (!/^[\x20-\x7e]*$/.test(value) || value.length > 99) throw new Error("Campo Pix inválido.");
  return id + String(value.length).padStart(2, "0") + value;
}
export function pixCrc16(value: string) {
  let crc = 0xffff;
  for (let i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
export function manualPixCode(plan: DirectPlan) {
  if (!DIRECT_PLANS.includes(plan)) throw new Error("Plano inválido.");
  const amount = (CATALOGO_OFERTAS[plan].precoCentavos / 100).toFixed(2);
  const payload = field("00", "01") + field("26", field("00", "br.gov.bcb.pix") + field("01", MANUAL_PIX_KEY))
    + field("52", "0000") + field("53", "986") + field("54", amount) + field("58", "BR")
    + field("59", MANUAL_PIX_NAME) + field("60", "Sao Paulo") + field("62", field("05", "***")) + "6304";
  return payload + pixCrc16(payload);
}
export function manualPixMessage(plan: DirectPlan) {
  const offer = CATALOGO_OFERTAS[plan];
  return `*Frota IA — pagamento por Pix*\n\nPlano: ${offer.label}\nPeríodo: ${plan.includes("ANUAL") ? "anual (365 dias)" : "mensal (um mês)"}\nAcesso: até ${offer.limiteVeiculos} veículo(s) · ${offer.painel ? "WhatsApp + painel web" : "direto no WhatsApp"}\nValor: *${formatarReais(offer.precoCentavos)}*\n\n*Pix Copia e Cola:*\n${manualPixCode(plan)}\n\nCopie somente o código acima e cole em Pix → Copia e Cola no aplicativo do seu banco. Confira o valor e os dados do recebedor antes de confirmar. Em caso de divergência, fale comigo antes de pagar.\nChave Pix (celular): ${MANUAL_PIX_KEY}\n\nApós pagar, me avise e confirme qual número de WhatsApp usará no Frota IA. Vou conferir o recebimento e liberar seu plano. Sem renovação automática.\n\nAtendimento RodaCore / Frota IA`;
}
