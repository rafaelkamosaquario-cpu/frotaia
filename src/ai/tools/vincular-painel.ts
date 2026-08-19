import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { buildAccountLinkUrl } from "@/services/whatsapp/accountLinkToken";
import { isWhatsappConfigured } from "@/lib/whatsapp/config";

/**
 * Ferramenta: vincular_painel
 *
 * Resolve a identidade dividida entre WhatsApp (usuário por telefone) e
 * Painel web (usuário por login Google) — ver docs/FROTA_IA_RAIO_X_V1_V2.md,
 * seção 19, item 3. Gera um link assinado (15 min) que a IA entrega pelo
 * WhatsApp; ao abrir esse link já logado com Google, a empresa do painel
 * passa a ser a MESMA do WhatsApp (sem duplicar cadastro). Não é uma
 * segunda ferramenta de Google Calendar — é vínculo de conta, categoria
 * diferente; `gerenciar_google_calendar` continua sendo a única ferramenta
 * de Agenda.
 *
 * Não conecta nada sozinha — só gera o link. A rota /auth/account/link é
 * quem de fato confirma o vínculo, exigindo sessão Google ativa e, se o
 * usuário Google já tiver outra empresa própria, uma confirmação explícita
 * antes de vincular (nunca funde automaticamente).
 */

export interface VincularPainelEntrada {
  userId: string;
  companyId: string;
}

export interface VincularPainelResultado extends ResultadoFerramentaBase {
  linkVinculo?: string;
}

function respostaFalha(alertas: string[], dadosFaltantes: string[] = []): VincularPainelResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível gerar o link de vínculo." };
}

async function executar(entrada: VincularPainelEntrada): Promise<VincularPainelResultado> {
  const { userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(["Não foi possível identificar o usuário/empresa para gerar o link."], ["userId", "companyId"]);
  }

  if (!isWhatsappConfigured()) {
    return respostaFalha(["O vínculo com o painel ainda não está disponível neste ambiente."]);
  }

  try {
    const linkVinculo = buildAccountLinkUrl(companyId, userId);
    return {
      sucesso: true,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      linkVinculo,
      mensagemResumo: "Link de vínculo com o painel gerado — expira em 15 minutos.",
    };
  } catch {
    return respostaFalha(["Não foi possível gerar o link de vínculo agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário do WhatsApp que pediu o vínculo (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa do WhatsApp a ser vinculada ao login do painel (do contexto da conversa)." },
];

export const ferramentaVincularPainel: DefinicaoFerramenta<VincularPainelEntrada, VincularPainelResultado> = {
  nome: "vincular_painel",
  descricao: "Gera um link seguro (válido por 15 minutos) para o cliente acessar o Painel Web com a MESMA empresa que já usa pelo WhatsApp, sem duplicar cadastro.",
  objetivo:
    "Resolver o pedido 'quero acessar pelo computador'/'tem painel?' sem o cliente precisar se cadastrar do zero — ele abre o link já logado com Google, e a empresa do painel vira a mesma do WhatsApp.",
  parametros: PARAMETROS,
  executar,
};
