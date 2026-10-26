import { CATALOGO_OFERTAS, type OfertaPlano } from "./catalog";
import { directSalesUrl } from "./directSales";
import { mensagemConfirmacaoOferta } from "./landingIntent";

/** Payment choices only; never records a payment or grants access. */
export function mensagemOpcoesContratacao(plano: OfertaPlano, checkoutUrl: string): string {
  const intro = mensagemConfirmacaoOferta(plano);
  if (CATALOGO_OFERTAS[plano].painel) return `${intro}\n\n${checkoutUrl}`;
  const directPlan = plano.includes("ANUAL") ? "INDIVIDUAL_ANUAL_PIX" : "INDIVIDUAL_MENSAL";
  return `${intro}\n\nEscolha como contratar:\n\n1. Checkout pelo Mercado Pago\nConfira as formas de pagamento disponíveis:\n${checkoutUrl}\n\n2. Pix com atendimento do Rafael\nReceba o Pix pelo atendimento, sem passar pelo checkout do Mercado Pago:\n${directSalesUrl(directPlan)}\n\nNo Pix com atendimento, Rafael confere o recebimento e libera o plano manualmente. Sem renovação automática. Abrir o link ou enviar comprovante não libera o acesso.`;
}
