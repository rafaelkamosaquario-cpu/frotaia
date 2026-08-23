import { CATALOGO_OFERTAS, formatarReais, PRECO_UPSELL_GESTAO_CENTAVOS, type OfertaPlano } from "./catalog";

/**
 * Reconhecimento determinístico das mensagens que os CTAs da landing page
 * abrem no WhatsApp (08/2026) — mesmo princípio de `ehPedidoDeAjuda`/
 * `ehPedidoDeFuncionalidades` (helpMenu.ts): interceptado ANTES da IA, pra
 * nunca depender do julgamento dela decidir "qual plano o cliente quis
 * dizer" numa mensagem que já veio 100% determinada pela landing.
 *
 * NUNCA extrai preço do texto — o texto só decide QUAL CHAVE do catálogo
 * usar; o valor cobrado sempre vem de CATALOGO_OFERTAS depois. Mesmo que
 * alguém adultere a mensagem pra "Individual por R$1", isso não muda nada:
 * a função só reconhece a palavra "individual" e devolve a chave "MENSAL"
 * — o preço nunca é lido daqui.
 */

export type IntencaoComercialLanding = OfertaPlano | "EMPRESAS";

const LIMITE_TAMANHO = 160; // mensagem de CTA é curta; evita falso positivo em texto longo que só cita a palavra de passagem

export function resolverIntencaoComercialLanding(texto: string | undefined | null): IntencaoComercialLanding | null {
  if (!texto) return null;
  const t = texto.trim().toLowerCase();
  if (!t || t.length > LIMITE_TAMANHO) return null;

  if (t.includes("frota ia empresas") || (t.includes("empresas") && (t.includes("mais de 10") || t.includes("frota grande")))) {
    return "EMPRESAS";
  }

  if (t.includes("individual")) {
    return "MENSAL";
  }

  if (t.includes("gestão") || t.includes("gestao")) {
    if (t.includes("mensal")) return "GESTAO_MENSAL";
    // "Gestão anual" sem especificar cartão/Pix — a escolha entre as duas
    // formas de pagamento continua acontecendo só dentro do gate /assinar,
    // nunca aqui. ANUAL_PARCELADO é só o valor inicial de UI: o gate trata
    // ANUAL_PARCELADO e ANUAL_PIX como a MESMA tela (as duas opções
    // aparecem sempre juntas — ver CheckoutGate.tsx, variável `ehAnual`).
    return "ANUAL_PARCELADO";
  }

  return null;
}

export const MENSAGEM_INTERESSE_EMPRESAS =
  "Legal que você tem uma frota maior! O Frota IA Empresas é atendimento comercial direto, sem automação — me conta quantos veículos você tem e o volume de uso esperado que já te encaminho com o time.";

/** Confirmação curta antes de gerar o link — mesmo texto usado tanto pra quem já tinha conta quanto pra quem acabou de concluir o onboarding vindo da landing. */
export function mensagemConfirmacaoOferta(plano: OfertaPlano): string {
  const oferta = CATALOGO_OFERTAS[plano];

  if (plano === "MENSAL") {
    return `Você escolheu o ${oferta.label} por ${formatarReais(oferta.precoCentavos)}/mês. No próximo passo você também vai poder optar pelo Painel de Gestão por +${formatarReais(PRECO_UPSELL_GESTAO_CENTAVOS)}/mês.`;
  }
  if (plano === "GESTAO_MENSAL") {
    return `Você escolheu o ${oferta.label} por ${formatarReais(oferta.precoCentavos)}/mês.`;
  }
  const cartao = CATALOGO_OFERTAS.ANUAL_PARCELADO;
  const pix = CATALOGO_OFERTAS.ANUAL_PIX;
  return `Você escolheu o Frota IA Gestão anual. No próximo passo você pode pagar no cartão em até ${cartao.parcelas}x de ${formatarReais(cartao.precoCentavos / (cartao.parcelas ?? 1))} ou no Pix por ${formatarReais(pix.precoCentavos)}.`;
}
