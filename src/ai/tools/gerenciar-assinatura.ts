import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { buildCheckoutLinkUrl } from "@/services/whatsapp/checkoutLinkToken";
import { CATALOGO_OFERTAS, PLANOS_AUTOATENDIMENTO, formatarReais, type OfertaPlano } from "@/lib/mercadopago/catalog";

/**
 * Ferramenta: gerenciar_assinatura
 *
 * Nova estrutura comercial (08/2026): em vez de gerar o link do Mercado
 * Pago direto, gera um link seguro pra página `/assinar` — um "gate de
 * contratação" leve do próprio Frota IA, que mostra o resumo do plano (e o
 * upsell do Individual pra Gestão) antes de ir pro Mercado Pago de fato.
 * Isso é o que permite oferecer o upsell sem tratar a página hospedada do
 * Mercado Pago como se fosse nossa. O e-mail (só necessário pros planos
 * recorrentes) passou a ser pedido na própria página, não mais aqui.
 *
 * NÃO bloqueia nem libera acesso por si só — só gera o link. O bloqueio de
 * acesso por assinatura vencida/inexistente é uma etapa separada (gating,
 * ver isAccessAllowed em subscriptionService.ts).
 */

export interface GerenciarAssinaturaEntrada {
  userId: string;
  companyId: string;
  conversationId?: string;
  plano: OfertaPlano;
}

export interface GerenciarAssinaturaResultado extends ResultadoFerramentaBase {
  plano?: OfertaPlano;
  linkContratacao?: string;
}

function respostaFalha(alertas: string[], dadosFaltantes: string[] = []): GerenciarAssinaturaResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível gerar o link de contratação." };
}

async function executar(entrada: GerenciarAssinaturaEntrada): Promise<GerenciarAssinaturaResultado> {
  const { userId, companyId, plano } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }
  if (!plano || !PLANOS_AUTOATENDIMENTO.includes(plano)) {
    return respostaFalha([`Plano inválido: "${plano}". Use um de: ${PLANOS_AUTOATENDIMENTO.join(", ")}.`]);
  }

  const link = buildCheckoutLinkUrl(companyId, plano);

  return {
    sucesso: true,
    alertas: [],
    premissas: [],
    dadosFaltantes: [],
    plano,
    linkContratacao: link,
    mensagemResumo: `Link de contratação do plano ${CATALOGO_OFERTAS[plano].label} gerado.`,
  };
}

/** Gerado a partir do catálogo (em vez de escrito na mão por chave) — com 9 combinações (3 planos × 3 formas de cobrança), hardcode por chave ficaria verboso e frágil a esquecimento quando o catálogo mudar. */
function descreverPlano(chave: OfertaPlano): string {
  const oferta = CATALOGO_OFERTAS[chave];
  const painel = oferta.painel ? "com Painel de Gestão" : "sem Painel de Gestão";
  const veiculos = `até ${oferta.limiteVeiculos} veículo${oferta.limiteVeiculos > 1 ? "s" : ""}`;

  if (oferta.cobranca === "recorrente") {
    return `${chave}: ${oferta.label}, ${formatarReais(oferta.precoCentavos)}/mês recorrente, ${painel}, ${veiculos}.`;
  }
  if (oferta.metodoUnico === "cartao") {
    return `${chave}: ${oferta.label}, até ${oferta.parcelas}x ${formatarReais(oferta.precoCentavos / (oferta.parcelas ?? 1))} (total ${formatarReais(oferta.precoCentavos)}), pagamento único no cartão, sem renovação automática, ${painel}, ${veiculos}, 12 meses de acesso.`;
  }
  return `${chave}: ${oferta.label}, ${formatarReais(oferta.precoCentavos)} à vista no Pix, pagamento único, sem renovação automática, ${painel}, ${veiculos}, 12 meses de acesso.`;
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa que vai assinar (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  {
    nome: "plano",
    tipo: "enum",
    obrigatorio: true,
    descricao:
      "Plano Individual (1 veículo, só WhatsApp), Essencial (até 3 veículos, WhatsApp + Painel) ou Pro (até 10 veículos, WhatsApp + Painel), cada um com 3 formas de cobrança (mensal recorrente, anual à vista no Pix, anual parcelado no cartão): " +
      PLANOS_AUTOATENDIMENTO.map(descreverPlano).join(" "),
    valoresPossiveis: PLANOS_AUTOATENDIMENTO,
  },
];

export const ferramentaGerenciarAssinatura: DefinicaoFerramenta<GerenciarAssinaturaEntrada, GerenciarAssinaturaResultado> = {
  nome: "gerenciar_assinatura",
  descricao: "Gera um link seguro de contratação do Frota IA (Individual, Essencial ou Pro, mensal ou anual) — o cliente confirma o plano e a forma de pagamento numa página leve antes de ir pro Mercado Pago.",
  objetivo:
    "Deixar o cliente assinar direto pelo WhatsApp: gera um link único vinculado à empresa dele, que abre uma página de resumo/confirmação e só então cria o checkout real do Mercado Pago — nunca gera o link de pagamento direto sem o cliente ver e confirmar o plano/valor antes.",
  parametros: PARAMETROS,
  executar,
};
