import type { SubscriptionPlanEnum } from "@/lib/supabase/tables";

/**
 * Catálogo central de ofertas comerciais (08/2026, nova estrutura
 * "Individual vs. Gestão"). Fonte ÚNICA de preço/cobrança/entitlement por
 * plano — usada pela tool `gerenciar_assinatura`, por `mercadopago/client.ts`
 * (geração do checkout real), pelo webhook (resolução de entitlement) e
 * pela página `/assinar`. Nunca espalhar preço/entitlement hardcoded em
 * outro lugar — se precisar do valor de um plano, importe daqui.
 *
 * `TRIAL` e `EMPRESA` (contratação comercial direta, sem automação) ficam
 * de fora de propósito — não são ofertas de autoatendimento.
 *
 * Preços em CENTAVOS inteiros (nunca float) — mesma convenção já usada
 * antes desta mudança (`PRECOS_CENTAVOS`).
 */

export type OfertaPlano = Exclude<SubscriptionPlanEnum, "TRIAL" | "EMPRESA">;

export const PLANOS_AUTOATENDIMENTO: OfertaPlano[] = ["MENSAL", "GESTAO_MENSAL", "ANUAL_PARCELADO", "ANUAL_PIX"];

export interface OfertaCatalogo {
  /** Nome comercial, usado no `reason`/título do checkout do Mercado Pago e nas telas. */
  label: string;
  precoCentavos: number;
  /** "recorrente": preapproval mensal, renova sozinho. "unica": cobrança única (checkout/preferences), sem renovação automática. */
  cobranca: "recorrente" | "unica";
  /** Só relevante pra cobrança única — quantos meses de acesso o pagamento garante. */
  validadeMeses: number | null;
  /** Direito ao Painel de Gestão que esta oferta concede — grava direto em subscriptions.fleet_panel_included via o webhook. */
  painel: boolean;
  /** Só informativo pras telas — o limite de verdade continua vindo de getVehicleLimitForCompany (src/lib/frota/vehicleLimit.ts), nunca duplicado aqui. */
  limiteVeiculos: 1 | 10;
  /** Só para cobrança única no cartão — número de parcelas oferecidas no Checkout Pro. */
  parcelas?: number;
}

export const CATALOGO_OFERTAS: Record<OfertaPlano, OfertaCatalogo> = {
  MENSAL: {
    label: "Frota IA Individual",
    precoCentavos: 7990,
    cobranca: "recorrente",
    validadeMeses: null,
    painel: false,
    limiteVeiculos: 1,
  },
  GESTAO_MENSAL: {
    label: "Frota IA Gestão Mensal",
    precoCentavos: 9990,
    cobranca: "recorrente",
    validadeMeses: null,
    painel: true,
    limiteVeiculos: 10,
  },
  ANUAL_PARCELADO: {
    label: "Frota IA Gestão Anual (cartão)",
    precoCentavos: 83880,
    cobranca: "unica",
    validadeMeses: 12,
    painel: true,
    limiteVeiculos: 10,
    parcelas: 12,
  },
  ANUAL_PIX: {
    label: "Frota IA Gestão Anual (Pix)",
    precoCentavos: 79900,
    cobranca: "unica",
    validadeMeses: 12,
    painel: true,
    limiteVeiculos: 10,
  },
};

/** Upsell do Individual — usado só pela tela /assinar e pela tool, nunca pra decidir preço real (isso é sempre CATALOGO_OFERTAS). */
export const PRECO_UPSELL_GESTAO_CENTAVOS = CATALOGO_OFERTAS.GESTAO_MENSAL.precoCentavos - CATALOGO_OFERTAS.MENSAL.precoCentavos;

export function isOfertaPlano(valor: string): valor is OfertaPlano {
  return (PLANOS_AUTOATENDIMENTO as string[]).includes(valor);
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
