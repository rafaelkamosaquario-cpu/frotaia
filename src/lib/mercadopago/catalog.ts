import type { SubscriptionPlanEnum } from "@/lib/supabase/tables";

/**
 * Catálogo central de ofertas comerciais (09/2026, estrutura
 * "Individual/Essencial/Pro"). Fonte ÚNICA de preço/cobrança/entitlement por
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

export type OfertaPlano = Exclude<SubscriptionPlanEnum, "TRIAL" | "EMPRESA" | "MENSAL" | "ANUAL_PARCELADO" | "ANUAL_PIX" | "GESTAO_MENSAL">;

export const PLANOS_AUTOATENDIMENTO: OfertaPlano[] = [
  "INDIVIDUAL_MENSAL",
  "INDIVIDUAL_ANUAL_PIX",
  "INDIVIDUAL_ANUAL_PARCELADO",
  "ESSENCIAL_MENSAL",
  "ESSENCIAL_ANUAL_PIX",
  "ESSENCIAL_ANUAL_PARCELADO",
  "PRO_MENSAL",
  "PRO_ANUAL_PIX",
  "PRO_ANUAL_PARCELADO",
];

export interface OfertaCatalogo {
  /** Nome comercial, usado no `reason`/título do checkout do Mercado Pago e nas telas. */
  label: string;
  precoCentavos: number;
  /** "recorrente": preapproval mensal, renova sozinho. "unica": cobrança única (checkout/preferences), sem renovação automática. */
  cobranca: "recorrente" | "unica";
  /** Só relevante pra cobrança única — quantos meses de acesso o pagamento garante. */
  validadeMeses: number | null;
  /** Só relevante pra cobrança única — qual forma de pagamento essa oferta usa no Checkout Pro (nunca as duas juntas). */
  metodoUnico?: "pix" | "cartao";
  /** Direito ao Painel de Gestão que esta oferta concede — grava direto em subscriptions.fleet_panel_included via o webhook. */
  painel: boolean;
  /** Só informativo pras telas — o limite de verdade continua vindo de getVehicleLimitForCompany (src/lib/frota/vehicleLimit.ts), nunca duplicado aqui. */
  limiteVeiculos: 1 | 3 | 10;
  /** Só para cobrança única no cartão — número de parcelas oferecidas no Checkout Pro. */
  parcelas?: number;
}

export const CATALOGO_OFERTAS: Record<OfertaPlano, OfertaCatalogo> = {
  INDIVIDUAL_MENSAL: {
    label: "Frota IA Individual",
    precoCentavos: 8990,
    cobranca: "recorrente",
    validadeMeses: null,
    painel: false,
    limiteVeiculos: 1,
  },
  INDIVIDUAL_ANUAL_PIX: {
    label: "Frota IA Individual Anual (Pix)",
    precoCentavos: 89900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "pix",
    painel: false,
    limiteVeiculos: 1,
  },
  INDIVIDUAL_ANUAL_PARCELADO: {
    label: "Frota IA Individual Anual (cartão)",
    precoCentavos: 89900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "cartao",
    painel: false,
    limiteVeiculos: 1,
    parcelas: 12,
  },
  ESSENCIAL_MENSAL: {
    label: "Frota IA Essencial",
    precoCentavos: 14990,
    cobranca: "recorrente",
    validadeMeses: null,
    painel: true,
    limiteVeiculos: 3,
  },
  ESSENCIAL_ANUAL_PIX: {
    label: "Frota IA Essencial Anual (Pix)",
    precoCentavos: 149900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "pix",
    painel: true,
    limiteVeiculos: 3,
  },
  ESSENCIAL_ANUAL_PARCELADO: {
    label: "Frota IA Essencial Anual (cartão)",
    precoCentavos: 149900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "cartao",
    painel: true,
    limiteVeiculos: 3,
    parcelas: 12,
  },
  PRO_MENSAL: {
    label: "Frota IA Pro",
    precoCentavos: 24990,
    cobranca: "recorrente",
    validadeMeses: null,
    painel: true,
    limiteVeiculos: 10,
  },
  PRO_ANUAL_PIX: {
    label: "Frota IA Pro Anual (Pix)",
    precoCentavos: 249900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "pix",
    painel: true,
    limiteVeiculos: 10,
  },
  PRO_ANUAL_PARCELADO: {
    label: "Frota IA Pro Anual (cartão)",
    precoCentavos: 249900,
    cobranca: "unica",
    validadeMeses: 12,
    metodoUnico: "cartao",
    painel: true,
    limiteVeiculos: 10,
    parcelas: 12,
  },
};

export function isOfertaPlano(valor: string): valor is OfertaPlano {
  return (PLANOS_AUTOATENDIMENTO as string[]).includes(valor);
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
