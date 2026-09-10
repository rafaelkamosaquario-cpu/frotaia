import { CATALOGO_OFERTAS, formatarReais, type OfertaPlano } from "./catalog";

/**
 * Reconhecimento determinístico das mensagens que os CTAs da landing page
 * abrem no WhatsApp (09/2026, estrutura Individual/Essencial/Pro) — mesmo
 * princípio de `ehPedidoDeAjuda`/`ehPedidoDeFuncionalidades` (helpMenu.ts):
 * interceptado ANTES da IA, pra nunca depender do julgamento dela decidir
 * "qual plano o cliente quis dizer" numa mensagem que já veio 100%
 * determinada pela landing.
 *
 * NUNCA extrai preço do texto — o texto só decide QUAL CHAVE do catálogo
 * usar; o valor cobrado sempre vem de CATALOGO_OFERTAS depois. Mesmo que
 * alguém adultere a mensagem pra "Individual por R$1", isso não muda nada:
 * a função só reconhece as palavras "individual"/"essencial"/"pro" (+
 * "anual" opcional) e devolve a chave correspondente — o preço nunca é
 * lido daqui.
 */

export type IntencaoComercialLanding = OfertaPlano | "EMPRESAS";

const LIMITE_TAMANHO = 160; // mensagem de CTA é curta; evita falso positivo em texto longo que só cita a palavra de passagem

type Tier = "INDIVIDUAL" | "ESSENCIAL" | "PRO";

const NOME_TIER: Record<Tier, string> = { INDIVIDUAL: "Individual", ESSENCIAL: "Essencial", PRO: "Pro" };

export function resolverIntencaoComercialLanding(texto: string | undefined | null): IntencaoComercialLanding | null {
  if (!texto) return null;
  const t = texto.trim().toLowerCase();
  if (!t || t.length > LIMITE_TAMANHO) return null;

  if (t.includes("frota ia empresas") || (t.includes("empresas") && (t.includes("mais de 10") || t.includes("frota grande")))) {
    return "EMPRESAS";
  }

  let tier: Tier | null = null;
  if (t.includes("individual")) tier = "INDIVIDUAL";
  else if (t.includes("essencial")) tier = "ESSENCIAL";
  else if (/\bpro\b/.test(t)) tier = "PRO";
  if (!tier) return null;

  // "anual" sem especificar cartão/Pix — a escolha entre as duas formas de
  // pagamento continua acontecendo só dentro do gate /assinar, nunca aqui.
  // ANUAL_PARCELADO é só o valor inicial de UI: o gate mostra as duas
  // opções sempre juntas quando a frequência é anual (ver CheckoutGate.tsx).
  const anual = t.includes("anual");
  return `${tier}_${anual ? "ANUAL_PARCELADO" : "MENSAL"}` as OfertaPlano;
}

export const MENSAGEM_INTERESSE_EMPRESAS =
  "Legal que você tem uma frota maior! O Frota IA Empresas é atendimento comercial direto, sem automação — me conta quantos veículos você tem e o volume de uso esperado que já te encaminho com o time.";

function tierDoPlano(plano: OfertaPlano): Tier {
  if (plano.startsWith("ESSENCIAL")) return "ESSENCIAL";
  if (plano.startsWith("PRO")) return "PRO";
  return "INDIVIDUAL";
}

/** Confirmação curta antes de gerar o link — mesmo texto usado tanto pra quem já tinha conta quanto pra quem acabou de concluir o onboarding vindo da landing. */
export function mensagemConfirmacaoOferta(plano: OfertaPlano): string {
  const oferta = CATALOGO_OFERTAS[plano];
  const tier = tierDoPlano(plano);
  const nome = NOME_TIER[tier];

  if (oferta.cobranca === "recorrente") {
    return `Você escolheu o Frota IA ${nome} por ${formatarReais(oferta.precoCentavos)}/mês. No próximo passo você também pode optar pelo pagamento anual, se preferir.`;
  }

  const cartao = CATALOGO_OFERTAS[`${tier}_ANUAL_PARCELADO` as OfertaPlano];
  const pix = CATALOGO_OFERTAS[`${tier}_ANUAL_PIX` as OfertaPlano];
  return `Você escolheu o Frota IA ${nome} anual. No próximo passo você pode pagar no cartão em até ${cartao.parcelas}x de ${formatarReais(cartao.precoCentavos / (cartao.parcelas ?? 1))} ou no Pix por ${formatarReais(pix.precoCentavos)}.`;
}
