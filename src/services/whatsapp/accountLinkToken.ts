import "server-only";
import { createSignedToken, verifySignedToken } from "@/lib/security/signedToken";
import { getWhatsappConfig } from "@/lib/whatsapp/config";

/**
 * Link seguro de vínculo de EMPRESA (não confundir com whatsappConnectLink.ts,
 * que vincula um número novo/desconhecido como canal do usuário logado —
 * fluxo pré-Camada 6, hoje órfão). Este aqui resolve o problema atual: o
 * cliente já tem uma empresa real e funcionando pelo WhatsApp (com
 * veículos/motoristas/despesas já cadastrados) e quer acessar o mesmo
 * painel logado com Google — sem duplicar a empresa.
 *
 * Não carrega segredo nenhum, só identifica a empresa e o usuário do
 * WhatsApp que pediu o vínculo (assinado, expira em 15 minutos). A prova de
 * posse do número vem do próprio link ter chegado por aquele WhatsApp —
 * mesmo princípio de segurança já usado em googleCalendarConnectLink.ts.
 * Reaproveita o segredo do WhatsApp (mesmo domínio de confiança: só quem
 * recebe mensagem daquele número consegue abrir o link).
 */

const LINK_TTL_SECONDS = 15 * 60;

export interface AccountLinkPayload extends Record<string, unknown> {
  companyId: string;
  whatsappUserId: string;
}

export function buildAccountLinkUrl(companyId: string, whatsappUserId: string): string {
  const { WHATSAPP_WEBHOOK_SECRET, APP_URL } = getWhatsappConfig();
  const token = createSignedToken({ companyId, whatsappUserId }, LINK_TTL_SECONDS, WHATSAPP_WEBHOOK_SECRET);
  return `${APP_URL}/auth/account/link?link=${encodeURIComponent(token)}`;
}

export function verifyAccountLinkToken(token: string): AccountLinkPayload {
  const { WHATSAPP_WEBHOOK_SECRET } = getWhatsappConfig();
  return verifySignedToken<AccountLinkPayload>(token, WHATSAPP_WEBHOOK_SECRET);
}
