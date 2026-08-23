import "server-only";
import { createSignedToken, verifySignedToken } from "@/lib/security/signedToken";
import { getWhatsappConfig } from "@/lib/whatsapp/config";
import type { OfertaPlano } from "@/lib/mercadopago/catalog";

/**
 * Link seguro de contratação (`/assinar`) — gerado pela tool
 * `gerenciar_assinatura` quando o cliente pede pra assinar. Mesmo padrão de
 * `accountLinkToken.ts` (HMAC-SHA256, curta duração, reaproveita o segredo
 * do WhatsApp — mesmo domínio de confiança: só quem recebeu a mensagem
 * daquele número consegue abrir o link).
 *
 * O token carrega só `companyId` + o plano que o cliente PEDIU na conversa
 * (`planoPreSelecionado`) — isso é só um valor inicial de UI (qual tela o
 * gate abre primeiro). O preço/entitlement de verdade NUNCA vem daqui:
 * a página sempre revalida o plano escolhido contra `CATALOGO_OFERTAS`
 * (src/lib/mercadopago/catalog.ts) antes de gerar o checkout real do
 * Mercado Pago — o token não é uma autorização de compra, só identifica a
 * empresa e evita pedir de novo o que o cliente já disse no WhatsApp.
 */

const LINK_TTL_SECONDS = 30 * 60;

export interface CheckoutLinkPayload extends Record<string, unknown> {
  companyId: string;
  planoPreSelecionado: OfertaPlano;
}

export function buildCheckoutLinkUrl(companyId: string, planoPreSelecionado: OfertaPlano): string {
  const { WHATSAPP_WEBHOOK_SECRET, APP_URL } = getWhatsappConfig();
  const token = createSignedToken({ companyId, planoPreSelecionado }, LINK_TTL_SECONDS, WHATSAPP_WEBHOOK_SECRET);
  return `${APP_URL}/assinar?token=${encodeURIComponent(token)}`;
}

export function verifyCheckoutLinkToken(token: string): CheckoutLinkPayload {
  const { WHATSAPP_WEBHOOK_SECRET } = getWhatsappConfig();
  return verifySignedToken<CheckoutLinkPayload>(token, WHATSAPP_WEBHOOK_SECRET);
}
