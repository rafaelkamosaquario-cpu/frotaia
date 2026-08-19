import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveMemory, listMemoriesForPrompt, forgetMemoryByKey } from "@/services/supabase/memoryService";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import type { AiMemoryTypeEnum } from "@/lib/supabase/tables";

/**
 * Ferramenta: gerenciar_memoria
 *
 * Única ferramenta que escreve/lê em ai_memories a partir de uma conversa —
 * até esta ferramenta existir, a tabela só era escrita por 2 chaves fixas
 * do onboarding (finalizeOnboarding.ts) e nunca era lida de volta. Serve só
 * para contexto solto que NÃO tem tabela estruturada própria — dado que já
 * tem lugar certo (veículo, custo, pneu, rota, estilo de resposta,
 * checklist, notícias) continua indo pela ferramenta específica, nunca por
 * aqui, para não duplicar a fonte de verdade.
 *
 * `escopo` decide EMPRESA (visível a todos os membros, user_id nulo) vs
 * USUARIO (só quem pediu, user_id preenchido) — mesma distinção usada pelo
 * carregamento do system prompt (listMemoriesForPrompt).
 *
 * Respeita company_preferences.allow_automatic_memory: quando desativado,
 * SALVAR só é aceito com confirmadoPeloUsuario:true (mesmo padrão de
 * `confirmation:true` já usado em gerenciar_google_calendar para EXCLUIR) —
 * a instrução de quando setar isso está no system prompt, não aqui.
 */

export type ModoGerenciarMemoria = "SALVAR" | "LISTAR" | "ESQUECER";
export type EscopoMemoria = "EMPRESA" | "USUARIO";

export interface GerenciarMemoriaEntrada {
  modo: ModoGerenciarMemoria;
  userId: string;
  companyId: string;
  conversationId?: string;

  // SALVAR / ESQUECER
  categoria?: AiMemoryTypeEnum;
  chave?: string;

  // SALVAR
  valor?: string;
  escopo?: EscopoMemoria;
  confirmadoPeloUsuario?: boolean;

  // ESQUECER
  escopoParaEsquecer?: EscopoMemoria;
}

export interface MemoriaResumo {
  categoria: AiMemoryTypeEnum;
  chave: string;
  valor: string;
  escopo: EscopoMemoria;
}

export interface GerenciarMemoriaResultado extends ResultadoFerramentaBase {
  modo: ModoGerenciarMemoria;
  memorias?: MemoriaResumo[];
  salvamentoAutomaticoPermitido?: boolean;
}

const CATEGORIAS: AiMemoryTypeEnum[] = ["profile", "vehicle", "cost", "tire", "route", "preference", "operational", "other"];

function respostaFalha(modo: ModoGerenciarMemoria, alertas: string[], dadosFaltantes: string[] = []): GerenciarMemoriaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de memória." };
}

async function executar(entrada: GerenciarMemoriaEntrada): Promise<GerenciarMemoriaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    switch (modo) {
      case "SALVAR": {
        const faltando: string[] = [];
        if (!entrada.categoria) faltando.push("categoria");
        if (!entrada.chave) faltando.push("chave");
        if (!entrada.valor) faltando.push("valor");
        if (!entrada.escopo) faltando.push("escopo");
        if (faltando.length > 0) {
          return respostaFalha(modo, ["Faltam dados para salvar a memória."], faltando);
        }

        const preferencias = await getOrCreatePreferences(admin, companyId);
        if (!preferencias.allow_automatic_memory && !entrada.confirmadoPeloUsuario) {
          return {
            sucesso: false,
            modo,
            alertas: ["Salvamento automático de memória está desativado para esta empresa — só posso guardar depois que o cliente confirmar explicitamente."],
            premissas: [],
            dadosFaltantes: ["confirmadoPeloUsuario"],
            salvamentoAutomaticoPermitido: false,
            mensagemResumo: "Preciso da confirmação explícita do cliente antes de salvar essa memória.",
          };
        }

        await saveMemory(admin, companyId, userId, {
          userId: entrada.escopo === "USUARIO" ? userId : undefined,
          memoryType: entrada.categoria,
          key: entrada.chave,
          summary: entrada.valor,
          sourceType: "user_explicit",
          confirmedByUser: true,
          conversationId: entrada.conversationId,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          mensagemResumo: "Memória salva.",
        };
      }

      case "LISTAR": {
        const ativas = await listMemoriesForPrompt(admin, companyId, userId);
        const memorias: MemoriaResumo[] = ativas.map((m) => ({
          categoria: m.memory_type,
          chave: m.key,
          valor: m.summary ?? (m.value_json && Object.keys(m.value_json as object).length > 0 ? JSON.stringify(m.value_json) : m.key),
          escopo: m.user_id ? "USUARIO" : "EMPRESA",
        }));

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          memorias,
          mensagemResumo: memorias.length === 0 ? "Não tenho nenhuma memória guardada sobre este cliente ainda." : `${memorias.length} memória(s) guardada(s).`,
        };
      }

      case "ESQUECER": {
        const faltando: string[] = [];
        if (!entrada.categoria) faltando.push("categoria");
        if (!entrada.chave) faltando.push("chave");
        if (faltando.length > 0) {
          return respostaFalha(modo, ["Preciso saber exatamente qual memória esquecer (categoria + chave — use LISTAR antes se não tiver certeza)."], faltando);
        }

        const escopo = entrada.escopoParaEsquecer ?? "EMPRESA";
        const removida = await forgetMemoryByKey(admin, companyId, userId, entrada.categoria!, entrada.chave!, escopo === "USUARIO" ? "usuario" : "empresa");

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          mensagemResumo: removida ? "Memória esquecida." : "Não encontrei essa memória — pode já ter sido esquecida antes.",
        };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoGerenciarMemoria, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch (err) {
    const detalhe = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(`[gerenciar-memoria] Falha no modo ${modo}: ${detalhe}`);
    return respostaFalha(modo, ["Não foi possível concluir a ação de memória agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["SALVAR", "LISTAR", "ESQUECER"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário atual (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa atual (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem, quando SALVAR." },
  {
    nome: "categoria",
    tipo: "enum",
    obrigatorio: false,
    descricao: "Categoria da memória (SALVAR e ESQUECER). Use 'other' se nenhuma outra se encaixar.",
    valoresPossiveis: CATEGORIAS,
  },
  { nome: "chave", tipo: "string", obrigatorio: false, descricao: "Identificador curto e estável da memória (ex.: 'horario_saida_preferido') — usado para atualizar/esquecer depois. Nunca um uuid." },
  { nome: "valor", tipo: "string", obrigatorio: false, descricao: "Texto da memória em linguagem natural (SALVAR) — o que deve ser lembrado." },
  {
    nome: "escopo",
    tipo: "enum",
    obrigatorio: false,
    descricao: "EMPRESA: visível a todos os membros da empresa (SALVAR padrão para a maioria dos casos). USUARIO: só para este usuário específico.",
    valoresPossiveis: ["EMPRESA", "USUARIO"],
  },
  { nome: "confirmadoPeloUsuario", tipo: "boolean", obrigatorio: false, descricao: "true só depois que o cliente confirmou explicitamente salvar — obrigatório quando o salvamento automático estiver desativado (ver preferência no contexto)." },
  { nome: "escopoParaEsquecer", tipo: "enum", obrigatorio: false, descricao: "Mesmo sentido de 'escopo', usado em ESQUECER (padrão EMPRESA se omitido).", valoresPossiveis: ["EMPRESA", "USUARIO"] },
];

export const ferramentaGerenciarMemoria: DefinicaoFerramenta<GerenciarMemoriaEntrada, GerenciarMemoriaResultado> = {
  nome: "gerenciar_memoria",
  descricao: "Salva, lista ou esquece memórias auxiliares sobre o cliente que não têm tabela estruturada própria — persiste entre conversas, compartilhado entre WhatsApp e painel.",
  objetivo: "Permitir que o cliente peça para você lembrar de algo (ou pergunte o que você já sabe, ou peça para esquecer), sem duplicar dado que já tem lugar certo no sistema.",
  parametros: PARAMETROS,
  executar,
};
