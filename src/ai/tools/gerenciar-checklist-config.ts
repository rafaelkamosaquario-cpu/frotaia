import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePreferences } from "@/services/supabase/companyPreferencesService";
import { CHECKLIST_ITEM_LABELS } from "@/services/supabase/checklistDispatchService";

/**
 * Ferramenta: gerenciar_checklist_config
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — company_preferences),
 * mesmo padrão de `definir_estilo_resposta`/`gerenciar_noticias_setor`.
 * Fecha a lacuna real: `checklist_enabled`/`checklist_send_hour`/
 * `checklist_item_keys` (Checklist V2) só eram editáveis pelo painel — o
 * WhatsApp não tinha como ligar/desligar ou ajustar o checklist diário.
 * O disparo em si continua sendo feito pelo job externo
 * (`/api/checklists/dispatch`), esta ferramenta só ajusta a configuração.
 */

const ITENS_VALIDOS = Object.keys(CHECKLIST_ITEM_LABELS);

export interface GerenciarChecklistConfigEntrada {
  userId: string;
  companyId: string;
  conversationId?: string;
  ativar?: boolean;
  horaEnvio?: number;
  itens?: string[];
}

export interface GerenciarChecklistConfigResultado extends ResultadoFerramentaBase {
  ativado?: boolean;
  horaEnvio?: number;
  itens?: string[];
}

function respostaFalha(alertas: string[], dadosFaltantes: string[] = []): GerenciarChecklistConfigResultado {
  return { sucesso: false, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível salvar a configuração do checklist." };
}

async function executar(entrada: GerenciarChecklistConfigEntrada): Promise<GerenciarChecklistConfigResultado> {
  const { userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }
  if (entrada.ativar === undefined && entrada.horaEnvio === undefined && entrada.itens === undefined) {
    return respostaFalha(["Informe o que quer mudar: ativar/desativar, horário de envio, ou itens do checklist."]);
  }
  if (entrada.horaEnvio !== undefined && (entrada.horaEnvio < 0 || entrada.horaEnvio > 23)) {
    return respostaFalha(["O horário de envio precisa ser um número entre 0 e 23 (hora de Brasília)."]);
  }
  if (entrada.itens) {
    if (entrada.itens.length === 0) return respostaFalha(["Deixe pelo menos 1 item ativo no checklist."]);
    const invalido = entrada.itens.find((i) => !ITENS_VALIDOS.includes(i));
    if (invalido) return respostaFalha([`Item de checklist inválido: "${invalido}". Use: ${ITENS_VALIDOS.join(", ")}.`]);
  }

  try {
    const admin = createAdminClient();
    const preferencias = await updatePreferences(admin, companyId, userId, {
      checklistEnabled: entrada.ativar,
      checklistSendHour: entrada.horaEnvio,
      checklistItemKeys: entrada.itens,
    });

    const partes: string[] = [];
    if (entrada.ativar !== undefined) partes.push(entrada.ativar ? "checklist diário ativado" : "checklist diário desativado");
    if (entrada.horaEnvio !== undefined) partes.push(`horário de envio definido para ${String(entrada.horaEnvio).padStart(2, "0")}:00`);
    if (entrada.itens) partes.push(`itens atualizados (${entrada.itens.join(", ")})`);

    return {
      sucesso: true,
      alertas: [],
      premissas: [],
      dadosFaltantes: [],
      ativado: preferencias.checklist_enabled,
      horaEnvio: preferencias.checklist_send_hour,
      itens: preferencias.checklist_item_keys,
      mensagemResumo: partes.join("; ") + ".",
    };
  } catch {
    return respostaFalha(["Não foi possível salvar a configuração do checklist agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da empresa (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da preferência (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "ativar", tipo: "boolean", obrigatorio: false, descricao: "true ativa o checklist diário automático, false desativa." },
  { nome: "horaEnvio", tipo: "number", obrigatorio: false, descricao: "Hora de Brasília (0-23) em que o checklist é enviado aos motoristas todo dia." },
  {
    nome: "itens",
    tipo: "enum",
    obrigatorio: false,
    descricao: "Lista completa de itens que o checklist deve conferir (substitui a lista atual inteira) — pelo menos 1 item.",
    valoresPossiveis: ITENS_VALIDOS,
  },
];

export const ferramentaGerenciarChecklistConfig: DefinicaoFerramenta<GerenciarChecklistConfigEntrada, GerenciarChecklistConfigResultado> = {
  nome: "gerenciar_checklist_config",
  descricao: "Ativa/desativa o checklist diário automático dos motoristas, ajusta o horário de envio ou os itens conferidos.",
  objetivo: "Deixar o cliente configurar o checklist diário pelo WhatsApp, sem precisar abrir o painel — mesma configuração (company_preferences) usada pelo job de disparo e pela tela de Configurações.",
  parametros: PARAMETROS,
  executar,
};
