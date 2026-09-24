"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompany } from "@/services/supabase/companyService";
import { criarAssinaturaMensal, criarPagamentoAnual } from "@/lib/mercadopago/client";
import { MercadoPagoConfigError } from "@/lib/mercadopago/config";
import { CATALOGO_OFERTAS, isOfertaPlano, type OfertaPlano } from "@/lib/mercadopago/catalog";
import { verifyCheckoutLinkToken } from "@/services/whatsapp/checkoutLinkToken";
import { logEvent } from "@/lib/observability/logger";
import { isMetodoCheckout } from "@/lib/mercadopago/paymentOptions";

export interface CriarCheckoutState {
  error?: string;
  initPoint?: string;
}

/**
 * Cria o checkout real do Mercado Pago — chamada só depois que o cliente já
 * viu o resumo/confirmou o plano na página `/assinar`. `companyId` vem
 * sempre do token assinado, revalidado nesta ação (nunca de input
 * livre); `plano` é validado contra o catálogo aqui de novo (nunca confia
 * em nada vindo do form além de ser uma das 9 chaves válidas) — preço e
 * entitlement são sempre resolvidos por dentro de `criarAssinaturaMensal`/
 * `criarPagamentoAnual` a partir de CATALOGO_OFERTAS, nunca do que o
 * cliente mandou.
 */
export async function criarCheckoutAction(
  checkoutToken: string,
  planoBruto: string,
  email: string | undefined,
  metodoBruto?: string
): Promise<CriarCheckoutState> {
  let companyId: string;
  try {
    companyId = verifyCheckoutLinkToken(checkoutToken).companyId;
  } catch {
    return { error: "Link inválido ou expirado. Volte ao WhatsApp e peça um novo link de assinatura." };
  }
  if (!isOfertaPlano(planoBruto)) {
    return { error: "Plano inválido." };
  }
  const plano: OfertaPlano = planoBruto;
  const metodo = metodoBruto ?? (CATALOGO_OFERTAS[plano].cobranca === "recorrente" ? "recorrente" : CATALOGO_OFERTAS[plano].metodoUnico === "pix" ? "pix" : "credito");
  if (!isMetodoCheckout(metodo) || (metodo === "recorrente" && CATALOGO_OFERTAS[plano].cobranca !== "recorrente")) return { error: "Forma de pagamento inválida." };

  const admin = createAdminClient();
  const company = await getCompany(admin, companyId);
  if (!company) {
    return { error: "Não encontramos sua empresa. Volte no WhatsApp e peça pra assinar de novo." };
  }

  try {
    if (metodo === "recorrente") {
      if (!email || !email.includes("@")) {
        return { error: "Informe um e-mail válido para continuar." };
      }
      const resultado = await criarAssinaturaMensal({ companyId, email, plano });
      logEvent({ event: "checkout_criado", route: "/assinar", company_id: companyId, plano, resource_id: resultado.id });
      return { initPoint: resultado.initPoint };
    }

    const resultado = await criarPagamentoAnual({ companyId, plano, metodo });
    logEvent({ event: "checkout_criado", route: "/assinar", company_id: companyId, plano, resource_id: resultado.id });
    return { initPoint: resultado.initPoint };
  } catch (erro) {
    // Nunca registrar e-mail, token, URL assinada ou corpo retornado pelo provedor.
    logEvent({ event: "checkout_criacao_falhou", route: "/assinar", company_id: companyId, plano,
      http_status: erro && typeof erro === "object" && "httpStatus" in erro && typeof erro.httpStatus === "number" ? erro.httpStatus : null });
    if (erro instanceof MercadoPagoConfigError) {
      return { error: "A integração de pagamento ainda não está configurada — avise o suporte." };
    }
    return { error: "Não foi possível gerar o checkout agora. Tente novamente em instantes." };
  }
}
