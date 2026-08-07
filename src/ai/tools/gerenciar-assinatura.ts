import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { criarAssinaturaMensal, criarPagamentoAnual } from "@/lib/mercadopago/client";
import { MercadoPagoConfigError } from "@/lib/mercadopago/config";

/**
 * Ferramenta: gerenciar_assinatura
 *
 * Gera um link de pagamento PERSONALIZADO (não um dos 3 links fixos do
 * painel do Mercado Pago) — o `external_reference` embutido no link é o
 * que permite ao webhook (/api/payments/mercadopago/webhook) saber
 * automaticamente qual empresa pagou e liberar o acesso sozinho, sem
 * conferência manual (decisão tomada com o Rafael em 07/08/2026).
 *
 * NÃO bloqueia nem libera acesso por si só — só gera o link. O bloqueio
 * de acesso por assinatura vencida/inexistente é uma etapa separada
 * (gating), ainda não ligada no loop principal de resposta.
 */

export type PlanoAssinatura = "MENSAL" | "ANUAL_PARCELADO" | "ANUAL_PIX";

const PLANOS: PlanoAssinatura[] = ["MENSAL", "ANUAL_PARCELADO", "ANUAL_PIX"];

export interface GerenciarAssinaturaEntrada {
  userId: string;
  companyId: string;
  conversationId?: string;
  plano: PlanoAssinatura;
  /** Obrigatório só para o plano MENSAL — a API do Mercado Pago exige e-mail do pagador pra assinatura recorrente. */
  email?: string;
}

export interface GerenciarAssinaturaResultado extends ResultadoFerramentaBase {
  plano?: PlanoAssinatura;
  linkPagamento?: string;
}

function respostaFalha(alertas: string[], dadosFaltantes: string[] = []): GerenciarAssinaturaResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível gerar o link de pagamento." };
}

async function executar(entrada: GerenciarAssinaturaEntrada): Promise<GerenciarAssinaturaResultado> {
  const { userId, companyId, plano, email } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }
  if (!plano || !PLANOS.includes(plano)) {
    return respostaFalha([`Plano inválido: "${plano}". Use um de: ${PLANOS.join(", ")}.`]);
  }
  if (plano === "MENSAL" && !email) {
    return respostaFalha(["Preciso do seu e-mail pra gerar o link do plano mensal (o Mercado Pago exige isso pra assinatura recorrente)."], ["email"]);
  }

  try {
    const resultado =
      plano === "MENSAL"
        ? await criarAssinaturaMensal({ companyId, email: email as string })
        : await criarPagamentoAnual({ companyId, modo: plano === "ANUAL_PARCELADO" ? "PARCELADO" : "PIX" });

    return {
      sucesso: true,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      plano,
      linkPagamento: resultado.initPoint,
      mensagemResumo: `Link de pagamento do plano ${plano.toLowerCase()} gerado.`,
    };
  } catch (erro) {
    if (erro instanceof MercadoPagoConfigError) {
      return respostaFalha(["A integração de pagamento ainda não está configurada — avise o suporte."]);
    }
    return respostaFalha(["Não foi possível gerar o link de pagamento agora. Tente novamente em instantes."]);
  }
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
      "MENSAL: R$79,90/mês recorrente (cartão ou Pix Automático). ANUAL_PARCELADO: 12x de R$59,90 (R$718,80 total), cobrança única parcelada, sem renovação automática. ANUAL_PIX: R$647,00 à vista no Pix, sem renovação automática.",
    valoresPossiveis: PLANOS,
  },
  { nome: "email", tipo: "string", obrigatorio: false, descricao: "E-mail do cliente — obrigatório só quando plano=MENSAL (exigido pela API do Mercado Pago pra assinatura recorrente)." },
];

export const ferramentaGerenciarAssinatura: DefinicaoFerramenta<GerenciarAssinaturaEntrada, GerenciarAssinaturaResultado> = {
  nome: "gerenciar_assinatura",
  descricao: "Gera um link de pagamento personalizado (Mercado Pago) pro cliente assinar o Frota IA — Mensal, Anual parcelado ou Anual no Pix.",
  objetivo:
    "Deixar o cliente assinar direto pelo WhatsApp: gera um link único vinculado à empresa dele, pra que o pagamento seja reconhecido e o acesso liberado automaticamente depois de confirmado.",
  parametros: PARAMETROS,
  executar,
};
