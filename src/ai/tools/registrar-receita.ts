import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { arredondar } from "./utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordRevenue, listRevenues, updateRevenue, deleteRevenue } from "@/services/supabase/revenueService";
import type { RevenueRow } from "@/lib/supabase/tables";

/**
 * Ferramenta: registrar_receita
 *
 * Ferramenta de INTEGRAÇÃO (I/O real com Supabase — `revenues`, migration
 * 20260903130000), mesmo contrato de `registrar_despesa`. Rodada de
 * evolução funcional 09/2026 (item 5/5, comparação com sistema de
 * planilha "Frota 7.15"): hoje NÃO existe nenhuma coluna estruturada de
 * receita — o valor de um frete fica preso dentro de JSON variável em
 * `analysis_runs.result_data`, não é agregável com confiança pra Relatórios.
 *
 * REGRA CRÍTICA (evita poluir o P&L com simulação): só chame REGISTRAR
 * depois que o cliente CONFIRMAR que o frete foi fechado/aceito de
 * verdade — nunca a partir de uma simulação/comparação de propostas do
 * `analisar_frete`. `analysisRunId` é só rastreabilidade opcional (qual
 * análise originou a receita, se o cliente mencionar), nunca preenchido
 * automaticamente a partir de um cálculo que ainda não virou frete real.
 */

export type ModoRegistrarReceita = "REGISTRAR" | "CONSULTAR" | "ATUALIZAR" | "EXCLUIR";

export interface RegistrarReceitaEntrada {
  modo: ModoRegistrarReceita;
  userId: string;
  companyId: string;
  conversationId?: string;
  vehicleId?: string;

  // REGISTRAR / ATUALIZAR
  valor?: number;
  /** Data da receita em YYYY-MM-DD (não a data de registro) — resolvida pela IA a partir da data atual informada no system prompt. */
  data?: string;
  motoristaId?: string;
  /** Id de uma análise de frete (analisar_frete) que originou esta receita, se o cliente mencionar — nunca invente, é só rastreabilidade opcional. */
  analiseFreteId?: string;
  descricao?: string;

  // CONSULTAR
  dataInicio?: string;
  dataFim?: string;
  limite?: number;

  // ATUALIZAR / EXCLUIR
  receitaId?: string;
  /** Obrigatório true em EXCLUIR — só depois que o cliente confirmar explicitamente, nunca excluir por decisão própria da IA. */
  confirmacao?: boolean;
}

export interface ReceitaResumo {
  id: string;
  valor: number;
  data: string;
  veiculoId: string | null;
  motoristaId: string | null;
  analiseFreteId: string | null;
  descricao: string | null;
}

export interface RegistrarReceitaResultado extends ResultadoFerramentaBase {
  modo: ModoRegistrarReceita;
  receita?: ReceitaResumo;
  itens?: ReceitaResumo[];
  totalGeral?: number;
  quantidadeEncontrada?: number;
}

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function mapaReceita(row: RevenueRow): ReceitaResumo {
  return {
    id: row.id,
    valor: Number(row.amount),
    data: row.revenue_date,
    veiculoId: row.vehicle_id,
    motoristaId: row.driver_id,
    analiseFreteId: row.analysis_run_id,
    descricao: row.description,
  };
}

function respostaFalha(modo: ModoRegistrarReceita, alertas: string[], dadosFaltantes: string[] = []): RegistrarReceitaResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a ação de receita." };
}

async function executar(entrada: RegistrarReceitaEntrada): Promise<RegistrarReceitaResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa para a receita."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    switch (modo) {
      case "REGISTRAR": {
        const faltando: string[] = [];
        if (entrada.valor === undefined) faltando.push("valor");
        if (!entrada.data) faltando.push("data");
        if (faltando.length > 0) {
          return respostaFalha(modo, ["Faltam dados para registrar a receita — nunca invento valor ou data."], faltando);
        }
        if (entrada.valor! <= 0) {
          return respostaFalha(modo, ["O valor da receita precisa ser maior que zero."]);
        }
        if (!DATA_REGEX.test(entrada.data!)) {
          return respostaFalha(modo, ['A data da receita precisa estar em "YYYY-MM-DD" — nunca uma expressão relativa.']);
        }

        const criada = await recordRevenue(admin, {
          companyId,
          userId,
          conversationId: entrada.conversationId,
          vehicleId: entrada.vehicleId,
          driverId: entrada.motoristaId,
          analysisRunId: entrada.analiseFreteId,
          amount: entrada.valor!,
          revenueDate: entrada.data!,
          description: entrada.descricao,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          receita: mapaReceita(criada),
          mensagemResumo: `Receita de R$${criada.amount.toFixed(2)} registrada.`,
        };
      }

      case "CONSULTAR": {
        const limite = Math.min(Math.max(entrada.limite ?? 50, 1), 200);
        const linhas = await listRevenues(admin, {
          companyId,
          vehicleId: entrada.vehicleId,
          dateFrom: entrada.dataInicio,
          dateTo: entrada.dataFim,
          limit: limite,
        });

        const itens = linhas.map(mapaReceita);
        const totalGeral = arredondar(itens.reduce((acc, i) => acc + i.valor, 0), 2);

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          itens,
          totalGeral,
          quantidadeEncontrada: itens.length,
          mensagemResumo: itens.length === 0 ? "Nenhuma receita encontrada com esses critérios." : `${itens.length} receita(s) encontrada(s), totalizando R$ ${totalGeral.toFixed(2)}.`,
        };
      }

      case "ATUALIZAR": {
        if (!entrada.receitaId) {
          return respostaFalha(modo, ["Preciso saber exatamente qual receita (receitaId) — use CONSULTAR antes se houver dúvida sobre qual é."], ["receitaId"]);
        }
        if (entrada.valor !== undefined && entrada.valor <= 0) {
          return respostaFalha(modo, ["O valor da receita precisa ser maior que zero."]);
        }
        if (entrada.data && !DATA_REGEX.test(entrada.data)) {
          return respostaFalha(modo, ['A data da receita precisa estar em "YYYY-MM-DD" — nunca uma expressão relativa.']);
        }

        const atualizada = await updateRevenue(admin, entrada.receitaId, companyId, {
          vehicleId: entrada.vehicleId,
          driverId: entrada.motoristaId,
          amount: entrada.valor,
          revenueDate: entrada.data,
          description: entrada.descricao,
        });

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          receita: mapaReceita(atualizada),
          mensagemResumo: "Receita atualizada.",
        };
      }

      case "EXCLUIR": {
        if (!entrada.receitaId) {
          return respostaFalha(modo, ["Preciso saber exatamente qual receita (receitaId) — use CONSULTAR antes se houver dúvida sobre qual é."], ["receitaId"]);
        }
        if (!entrada.confirmacao) {
          return respostaFalha(modo, ["Antes de excluir, confirme com o cliente qual receita exatamente e só então chame de novo com confirmacao:true."], ["confirmacao"]);
        }

        await deleteRevenue(admin, entrada.receitaId, companyId);

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          mensagemResumo: "Receita excluída.",
        };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoRegistrarReceita, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch {
    return respostaFalha(modo, ["Não foi possível concluir a ação de receita agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["REGISTRAR", "CONSULTAR", "ATUALIZAR", "EXCLUIR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário dono da receita (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa dona da receita (do contexto da conversa)." },
  { nome: "conversationId", tipo: "string", obrigatorio: false, descricao: "Conversa de origem." },
  { nome: "vehicleId", tipo: "string", obrigatorio: false, descricao: "Veículo relacionado à receita, quando identificado (REGISTRAR) ou filtro (CONSULTAR)." },
  {
    nome: "valor",
    tipo: "number",
    obrigatorio: false,
    descricao: "Valor da receita em reais — obrigatório em REGISTRAR. Só registre depois que o cliente confirmar que o frete foi fechado/aceito de verdade, nunca a partir de uma simulação do analisar_frete.",
  },
  { nome: "data", tipo: "string", obrigatorio: false, descricao: 'Data da receita em "YYYY-MM-DD" — obrigatória em REGISTRAR.' },
  { nome: "motoristaId", tipo: "string", obrigatorio: false, descricao: "Motorista que fez o frete, se identificado." },
  { nome: "analiseFreteId", tipo: "string", obrigatorio: false, descricao: "Id de uma análise de frete (analisar_frete) que originou esta receita, se o cliente mencionar — só rastreabilidade, nunca invente." },
  { nome: "descricao", tipo: "string", obrigatorio: false, descricao: "Descrição livre adicional (ex.: rota/cliente do frete)." },
  { nome: "dataInicio", tipo: "string", obrigatorio: false, descricao: "Início do período em YYYY-MM-DD (CONSULTAR), já resolvido a partir da data atual." },
  { nome: "dataFim", tipo: "string", obrigatorio: false, descricao: "Fim do período em YYYY-MM-DD (CONSULTAR)." },
  { nome: "limite", tipo: "number", obrigatorio: false, descricao: "Máximo de resultados em CONSULTAR (padrão 50, limite 200)." },
  { nome: "receitaId", tipo: "string", obrigatorio: false, descricao: "Id da receita — obrigatório em ATUALIZAR/EXCLUIR. Use CONSULTAR antes se não tiver certeza de qual é." },
  { nome: "confirmacao", tipo: "boolean", obrigatorio: false, descricao: "EXCLUIR: só true depois que o cliente confirmou explicitamente qual receita excluir." },
];

export const ferramentaRegistrarReceita: DefinicaoFerramenta<RegistrarReceitaEntrada, RegistrarReceitaResultado> = {
  nome: "registrar_receita",
  descricao: "Registra, consulta, atualiza e exclui receitas de frete já fechados — nunca a partir de simulação. Junto com registrar_despesa, alimenta o Resultado (receita - custo) de Relatórios.",
  objetivo:
    "Transformar um frete que o cliente confirmou ter fechado/aceito num registro estruturado (revenues), reaproveitando o mesmo padrão de registrar_despesa. Só chame REGISTRAR depois de confirmação explícita do cliente — analisar_frete/COMPARACAO_PROPOSTAS são simulação e nunca devem virar receita sozinhos.",
  parametros: PARAMETROS,
  executar,
};
