import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { buildCheckoutLinkUrl } from "@/services/whatsapp/checkoutLinkToken";
import { CATALOGO_OFERTAS, PLANOS_AUTOATENDIMENTO, PRECO_UPSELL_GESTAO_CENTAVOS, formatarReais, type OfertaPlano } from "@/lib/mercadopago/catalog";

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

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa que vai assinar (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  {
    nome: "plano",
    tipo: "enum",
    obrigatorio: true,
    descricao:
      `MENSAL: Frota IA Individual, ${formatarReais(CATALOGO_OFERTAS.MENSAL.precoCentavos)}/mês recorrente, sem Painel de Gestão, 1 veículo. ` +
      `GESTAO_MENSAL: Frota IA Gestão Mensal, ${formatarReais(CATALOGO_OFERTAS.GESTAO_MENSAL.precoCentavos)}/mês recorrente (Individual + upsell de ${formatarReais(PRECO_UPSELL_GESTAO_CENTAVOS)}), com Painel de Gestão, até 10 veículos — use quando o cliente pedir isso diretamente (ex.: "quero o painel no mensal"); a opção MENSAL também oferece esse upgrade dentro da própria página de contratação, então não é a única forma de chegar lá. ` +
      `ANUAL_PARCELADO: Frota IA Gestão Anual no cartão, até ${CATALOGO_OFERTAS.ANUAL_PARCELADO.parcelas}x ${formatarReais(CATALOGO_OFERTAS.ANUAL_PARCELADO.precoCentavos / (CATALOGO_OFERTAS.ANUAL_PARCELADO.parcelas ?? 1))} (total ${formatarReais(CATALOGO_OFERTAS.ANUAL_PARCELADO.precoCentavos)}), pagamento único, sem renovação automática, com Painel de Gestão, até 10 veículos, 12 meses de acesso. ` +
      `ANUAL_PIX: Frota IA Gestão Anual no Pix, ${formatarReais(CATALOGO_OFERTAS.ANUAL_PIX.precoCentavos)} à vista, pagamento único, sem renovação automática, com Painel de Gestão, até 10 veículos, 12 meses de acesso.`,
    valoresPossiveis: PLANOS_AUTOATENDIMENTO,
  },
];

export const ferramentaGerenciarAssinatura: DefinicaoFerramenta<GerenciarAssinaturaEntrada, GerenciarAssinaturaResultado> = {
  nome: "gerenciar_assinatura",
  descricao: "Gera um link seguro de contratação do Frota IA (Individual, Gestão Mensal ou Gestão Anual) — o cliente confirma o plano e a forma de pagamento numa página leve antes de ir pro Mercado Pago.",
  objetivo:
    "Deixar o cliente assinar direto pelo WhatsApp: gera um link único vinculado à empresa dele, que abre uma página de resumo/confirmação e só então cria o checkout real do Mercado Pago — nunca gera o link de pagamento direto sem o cliente ver e confirmar o plano/valor antes.",
  parametros: PARAMETROS,
  executar,
};
