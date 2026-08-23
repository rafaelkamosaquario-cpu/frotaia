"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCompany } from "@/services/supabase/companyService";
import { criarAssinaturaMensal, criarPagamentoAnual } from "@/lib/mercadopago/client";
import { MercadoPagoConfigError } from "@/lib/mercadopago/config";
import { CATALOGO_OFERTAS, isOfertaPlano, type OfertaPlano } from "@/lib/mercadopago/catalog";

export interface CriarCheckoutState {
  error?: string;
  initPoint?: string;
}

/**
 * Cria o checkout real do Mercado Pago — chamada só depois que o cliente já
 * viu o resumo/confirmou o plano na página `/assinar`. `companyId` vem
 * sempre de um token assinado já verificado em page.tsx (nunca de input
 * livre); `plano` é validado contra o catálogo aqui de novo (nunca confia
 * em nada vindo do form além de ser uma das 4 chaves válidas) — preço e
 * entitlement são sempre resolvidos por dentro de `criarAssinaturaMensal`/
 * `criarPagamentoAnual` a partir de CATALOGO_OFERTAS, nunca do que o
 * cliente mandou.
 */
export async function criarCheckoutAction(
  companyId: string,
  planoBruto: string,
  email: string | undefined
): Promise<CriarCheckoutState> {
  if (!isOfertaPlano(planoBruto)) {
    return { error: "Plano inválido." };
  }
  const plano: OfertaPlano = planoBruto;

  const admin = createAdminClient();
  const company = await getCompany(admin, companyId);
  if (!company) {
    return { error: "Não encontramos sua empresa. Volte no WhatsApp e peça pra assinar de novo." };
  }

  const oferta = CATALOGO_OFERTAS[plano];

  try {
    if (oferta.cobranca === "recorrente") {
      if (!email || !email.includes("@")) {
        return { error: "Informe um e-mail válido para continuar." };
      }
      if (plano !== "MENSAL" && plano !== "GESTAO_MENSAL") {
        return { error: "Plano inválido para assinatura recorrente." };
      }
      const resultado = await criarAssinaturaMensal({ companyId, email, plano });
      return { initPoint: resultado.initPoint };
    }

    if (plano !== "ANUAL_PARCELADO" && plano !== "ANUAL_PIX") {
      return { error: "Plano inválido para pagamento único." };
    }
    const resultado = await criarPagamentoAnual({ companyId, modo: plano === "ANUAL_PARCELADO" ? "PARCELADO" : "PIX" });
    return { initPoint: resultado.initPoint };
  } catch (erro) {
    if (erro instanceof MercadoPagoConfigError) {
      return { error: "A integração de pagamento ainda não está configurada — avise o suporte." };
    }
    return { error: "Não foi possível gerar o checkout agora. Tente novamente em instantes." };
  }
}
