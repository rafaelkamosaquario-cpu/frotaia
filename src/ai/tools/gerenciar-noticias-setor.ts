import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePreferences } from "@/services/supabase/companyPreferencesService";

/**
 * Ferramenta: gerenciar_noticias_setor
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — company_preferences),
 * mesmo padrão de `definir_estilo_resposta`. Grava em
 * `company_preferences.daily_news_enabled`.
 *
 * Opt-in, padrão desativado (decisão explícita do Rafael via
 * AskUserQuestion em 06/08/2026, pelo risco de ban por spam no WhatsApp
 * se fosse opt-out) — só liga quando o cliente pede explicitamente.
 * O despacho diário em si é feito por um job externo
 * (`/api/news/dispatch`), não por esta ferramenta.
 */

export interface GerenciarNoticiasSetorEntrada {
  userId: string;
  companyId: string;
  conversationId?: string;
  ativar: boolean;
}

export interface GerenciarNoticiasSetorResultado extends ResultadoFerramentaBase {
  ativado?: boolean;
}

function respostaFalha(alertas: string[]): GerenciarNoticiasSetorResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes: ["ativar"], mensagemResumo: alertas[0] ?? "Não foi possível salvar a preferência de notícias." };
}

async function executar(entrada: GerenciarNoticiasSetorEntrada): Promise<GerenciarNoticiasSetorResultado> {
  const { userId, companyId, ativar } = entrada;

  if (!userId || !companyId) {
    return { sucesso: false, alertas: ["Não foi possível identificar o usuário/empresa."], premissas: [], dadosFaltantes: ["userId", "companyId"], mensagemResumo: "Não foi possível salvar a preferência de notícias." };
  }
  if (typeof ativar !== "boolean") {
    return respostaFalha(["Informe se é para ativar ou desativar as notícias diárias."]);
  }

  try {
    const admin = createAdminClient();
    await updatePreferences(admin, companyId, userId, { dailyNewsEnabled: ativar });

    return {
      sucesso: true,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      ativado: ativar,
      mensagemResumo: ativar
        ? "Notícias diárias do setor ativadas — você vai receber um resumo curto por dia com as principais notícias de transporte/logística."
        : "Notícias diárias do setor desativadas.",
    };
  } catch {
    return respostaFalha(["Não foi possível salvar a preferência de notícias agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da preferência (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  {
    nome: "ativar",
    tipo: "boolean",
    obrigatorio: true,
    descricao: "true para ativar o envio diário de notícias do setor pelo WhatsApp, false para desativar.",
  },
];

export const ferramentaGerenciarNoticiasSetor: DefinicaoFerramenta<GerenciarNoticiasSetorEntrada, GerenciarNoticiasSetorResultado> = {
  nome: "gerenciar_noticias_setor",
  descricao: "Ativa ou desativa o envio diário de um resumo curto de notícias do setor de transporte/logística pelo WhatsApp — opt-in, desativado por padrão.",
  objetivo:
    "Deixar o cliente escolher se quer receber, uma vez por dia, um resumo com 2-3 notícias relevantes do setor (fretes, combustível, legislação, estradas). Nunca ativa sozinho — só quando o cliente pede.",
  parametros: PARAMETROS,
  executar,
};
