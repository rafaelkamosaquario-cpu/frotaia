import type { DefinicaoFerramenta, DefinicaoParametroFerramenta, ResultadoFerramentaBase } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMatchesForCompany, getMatch, updateMatchStatus } from "@/services/supabase/freightMatchService";
import { getOpportunity } from "@/services/supabase/freightOpportunityService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { analisarOportunidadeParaMatch } from "@/services/freight/radarMatchingEngine";
import type { FreightOpportunityMatchRow, FreightOpportunityRow, FreightRadarRow } from "@/lib/supabase/tables";
import { listRadarsForCompany } from "@/services/supabase/freightRadarService";

/**
 * Ferramenta: consultar_oportunidades_frete
 *
 * Lado "leitura/decisão" do Radar de Fretes — complementa
 * gerenciar_radar_frete (que só cuida da busca em si). ANALISAR reaproveita
 * exatamente a mesma função usada pelo matching automático
 * (analisarOportunidadeParaMatch) — nunca um segundo motor de cálculo
 * (etapa 2 da spec). Rodando aqui, dentro de uma conversa real, a IA ainda
 * pode complementar com verificar_piso_minimo_antt/calcular_custo_viagem se
 * o cliente quiser o quadro completo (fora do escopo desta ferramenta).
 */

export type ModoConsultarOportunidadesFrete = "LISTAR" | "DETALHAR" | "ANALISAR" | "IGNORAR" | "FAVORITAR";

export interface ConsultarOportunidadesFreteEntrada {
  modo: ModoConsultarOportunidadesFrete;
  userId: string;
  companyId: string;
  matchId?: string;
}

export interface OportunidadeMatchResumo {
  matchId: string;
  score: number;
  status: string;
  origem: string | null;
  destino: string | null;
  dataColeta: string | null;
  carroceria: string | null;
  pesoKg: number | null;
  valorReais: number | null;
  textoOriginal: string;
}

export interface ConsultarOportunidadesFreteResultado extends ResultadoFerramentaBase {
  modo: ModoConsultarOportunidadesFrete;
  oportunidade?: OportunidadeMatchResumo;
  oportunidades?: OportunidadeMatchResumo[];
}

function mapaResumo(match: FreightOpportunityMatchRow, opportunity: FreightOpportunityRow): OportunidadeMatchResumo {
  return {
    matchId: match.id,
    score: match.compatibility_score,
    status: match.status,
    origem: [opportunity.origin_city, opportunity.origin_state].filter(Boolean).join(" - ") || null,
    destino: [opportunity.destination_city, opportunity.destination_state].filter(Boolean).join(" - ") || null,
    dataColeta: opportunity.pickup_date,
    carroceria: opportunity.body_type,
    pesoKg: opportunity.weight_kg,
    valorReais: opportunity.freight_value_cents ? opportunity.freight_value_cents / 100 : null,
    textoOriginal: opportunity.original_text,
  };
}

function respostaFalha(modo: ModoConsultarOportunidadesFrete, alertas: string[], dadosFaltantes: string[] = []): ConsultarOportunidadesFreteResultado {
  return { sucesso: false, modo, alertas, premissas: [], dadosFaltantes, mensagemResumo: alertas[0] ?? "Não foi possível concluir a consulta de oportunidades." };
}

async function carregarRadarDoMatch(admin: ReturnType<typeof createAdminClient>, companyId: string, match: FreightOpportunityMatchRow): Promise<FreightRadarRow | undefined> {
  const radares = await listRadarsForCompany(admin, companyId);
  return radares.find((r) => r.id === match.radar_id);
}

async function executar(entrada: ConsultarOportunidadesFreteEntrada): Promise<ConsultarOportunidadesFreteResultado> {
  const { modo, userId, companyId } = entrada;

  if (!userId || !companyId) {
    return respostaFalha(modo, ["Não foi possível identificar o usuário/empresa."], ["userId", "companyId"]);
  }

  const admin = createAdminClient();

  try {
    switch (modo) {
      case "LISTAR": {
        const matches = await listMatchesForCompany(admin, companyId);
        const resumos: OportunidadeMatchResumo[] = [];
        for (const match of matches) {
          const oportunidade = await getOpportunity(admin, match.opportunity_id);
          if (oportunidade) resumos.push(mapaResumo(match, oportunidade));
        }
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          oportunidades: resumos,
          mensagemResumo: resumos.length === 0 ? "Nenhuma oportunidade encontrada ainda." : `${resumos.length} oportunidade(s) de frete.`,
        };
      }

      case "DETALHAR": {
        if (!entrada.matchId) return respostaFalha(modo, ["Preciso saber exatamente qual oportunidade (matchId) — use LISTAR antes."], ["matchId"]);
        const match = await getMatch(admin, entrada.matchId, companyId);
        if (!match) return respostaFalha(modo, ["Não encontrei essa oportunidade para esta empresa."], ["matchId"]);
        const oportunidade = await getOpportunity(admin, match.opportunity_id);
        if (!oportunidade) return respostaFalha(modo, ["Oportunidade não encontrada."], ["matchId"]);
        if (match.status === "notified") await updateMatchStatus(admin, match.id, companyId, "viewed");
        return { sucesso: true, modo, alertas: [], premissas: [], dadosFaltantes: [], oportunidade: mapaResumo(match, oportunidade), mensagemResumo: "Detalhes da oportunidade." };
      }

      case "ANALISAR": {
        if (!entrada.matchId) return respostaFalha(modo, ["Preciso saber exatamente qual oportunidade analisar (matchId) — use LISTAR antes."], ["matchId"]);
        const match = await getMatch(admin, entrada.matchId, companyId);
        if (!match) return respostaFalha(modo, ["Não encontrei essa oportunidade para esta empresa."], ["matchId"]);
        const oportunidade = await getOpportunity(admin, match.opportunity_id);
        if (!oportunidade) return respostaFalha(modo, ["Oportunidade não encontrada."], ["matchId"]);
        if (!match.vehicle_id) return respostaFalha(modo, ["Este radar não tem veículo associado — associe um veículo ao radar antes de pedir análise."], ["veiculoId"]);
        const veiculo = await getVehicle(admin, match.vehicle_id);
        if (!veiculo || veiculo.company_id !== companyId) return respostaFalha(modo, ["Veículo do radar não encontrado."]);
        const radar = await carregarRadarDoMatch(admin, companyId, match);
        if (!radar) return respostaFalha(modo, ["Radar associado a esta oportunidade não encontrado."]);

        await analisarOportunidadeParaMatch(admin, match.id, companyId, oportunidade, radar, veiculo);
        const matchAtualizado = await getMatch(admin, match.id, companyId);

        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          oportunidade: matchAtualizado ? mapaResumo(matchAtualizado, oportunidade) : mapaResumo(match, oportunidade),
          mensagemResumo:
            matchAtualizado?.status === "analyzed"
              ? "Análise preliminar concluída (veja o resultado da pré-análise em analysis_runs) — só considera custo de combustível; peça o cálculo completo (calcular_custo_viagem/analisar_frete com os dados salvos) se quiser todos os custos."
              : "Não foi possível concluir a análise preliminar desta oportunidade — faltam dados (rota ou perfil de custo do veículo).",
        };
      }

      case "IGNORAR":
      case "FAVORITAR": {
        if (!entrada.matchId) return respostaFalha(modo, ["Preciso saber exatamente qual oportunidade (matchId) — use LISTAR antes."], ["matchId"]);
        const status = modo === "IGNORAR" ? "ignored" : "favorited";
        const match = await updateMatchStatus(admin, entrada.matchId, companyId, status);
        const oportunidade = await getOpportunity(admin, match.opportunity_id);
        return {
          sucesso: true,
          modo,
          alertas: [],
          premissas: [],
          dadosFaltantes: [],
          oportunidade: oportunidade ? mapaResumo(match, oportunidade) : undefined,
          mensagemResumo: modo === "IGNORAR" ? "Oportunidade ignorada." : "Oportunidade favoritada.",
        };
      }

      default: {
        const modoNuncaVisto: never = modo;
        return respostaFalha(modoNuncaVisto as ModoConsultarOportunidadesFrete, [`Modo desconhecido: ${String(modoNuncaVisto)}.`]);
      }
    }
  } catch (err) {
    const detalhe = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(`[consultar-oportunidades-frete] Falha no modo ${modo}: ${detalhe}`);
    return respostaFalha(modo, ["Não foi possível concluir a consulta agora. Tente novamente em instantes."]);
  }
}

const PARAMETROS: DefinicaoParametroFerramenta[] = [
  { nome: "modo", tipo: "enum", obrigatorio: true, descricao: "Operação a executar.", valoresPossiveis: ["LISTAR", "DETALHAR", "ANALISAR", "IGNORAR", "FAVORITAR"] },
  { nome: "userId", tipo: "string", obrigatorio: true, descricao: "Usuário atual (do contexto da conversa, nunca da mensagem)." },
  { nome: "companyId", tipo: "string", obrigatorio: true, descricao: "Empresa atual (do contexto da conversa)." },
  { nome: "matchId", tipo: "string", obrigatorio: false, descricao: "Id da oportunidade/match — obrigatório em DETALHAR/ANALISAR/IGNORAR/FAVORITAR. Use LISTAR antes se não tiver certeza de qual é." },
];

export const ferramentaConsultarOportunidadesFrete: DefinicaoFerramenta<ConsultarOportunidadesFreteEntrada, ConsultarOportunidadesFreteResultado> = {
  nome: "consultar_oportunidades_frete",
  descricao: "Lista, detalha, analisa, ignora ou favorita oportunidades de frete encontradas pelo Radar — compatíveis com algum radar ativo do cliente.",
  objetivo: "Deixar o cliente ver as cargas que o Radar encontrou e decidir o que fazer com cada uma, incluindo pedir a análise econômica reaproveitando as ferramentas de cálculo já existentes.",
  parametros: PARAMETROS,
  executar,
};
