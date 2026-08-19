import type { FreightOpportunityRow, FreightRadarRow, VehicleBodyTypeEnum } from "@/lib/supabase/tables";

/**
 * Radar de Fretes (MVP) — matching determinístico (etapa 20/24 da spec):
 * roda ANTES de qualquer ferramenta financeira, sem Claude. Separado em
 * "match" (essa carga parece servir?) vs. "análise" (compensa
 * economicamente?) — este módulo só resolve o match.
 *
 * Simplificação deliberada da v1 (confirmada com o Rafael): sem raio
 * geográfico/geocoding por mensagem — matching de origem/destino é por UF.
 * Cidade fica só como dado auxiliar de exibição, não entra no score.
 */

export const MATCH_SCORE_PESO_ORIGEM = 30;
export const MATCH_SCORE_PESO_DESTINO = 30;
export const MATCH_SCORE_PESO_CARROCERIA = 20;
export const MATCH_SCORE_PESO_DATA = 20;

export const MATCH_LIMIAR_FORTE = 70;
export const MATCH_LIMIAR_MINIMO = 40;

export type NivelMatch = "SEM_MATCH" | "PARCIAL" | "FORTE";

export interface ResultadoMatch {
  score: number;
  nivel: NivelMatch;
  detalhes: string[];
}

function nivelParaScore(score: number): NivelMatch {
  if (score >= MATCH_LIMIAR_FORTE) return "FORTE";
  if (score >= MATCH_LIMIAR_MINIMO) return "PARCIAL";
  return "SEM_MATCH";
}

function semMatch(motivo: string): ResultadoMatch {
  return { score: 0, nivel: "SEM_MATCH", detalhes: [motivo] };
}

/**
 * Compara um radar ativo com uma oportunidade recebida (+ carroceria do
 * veículo associado, se houver). UF divergente em origem OU destino é
 * critério eliminatório (gate) — o resto (carroceria, data) é aditivo sobre
 * uma base de 60 pontos, nunca elimina sozinho (carroceria/data ausentes ou
 * divergentes só reduzem o score, nunca zeram o match).
 */
export function calcularMatch(radar: FreightRadarRow, opportunity: FreightOpportunityRow, veiculoBodyType: VehicleBodyTypeEnum | null): ResultadoMatch {
  const detalhes: string[] = [];

  if (radar.origin_state && opportunity.origin_state && radar.origin_state !== opportunity.origin_state) {
    return semMatch(`Origem não bate: radar pede ${radar.origin_state}, oportunidade é de ${opportunity.origin_state}.`);
  }
  if (radar.destination_state && opportunity.destination_state && radar.destination_state !== opportunity.destination_state) {
    return semMatch(`Destino não bate: radar pede ${radar.destination_state}, oportunidade vai para ${opportunity.destination_state}.`);
  }

  let score = 0;

  if (opportunity.origin_state) {
    score += MATCH_SCORE_PESO_ORIGEM;
    detalhes.push(`Origem confirmada (${opportunity.origin_state}).`);
  } else {
    score += MATCH_SCORE_PESO_ORIGEM / 2;
    detalhes.push("Origem da oportunidade não confirmada.");
  }

  if (!radar.destination_state) {
    score += MATCH_SCORE_PESO_DESTINO / 2;
    detalhes.push("Radar sem destino fixo — qualquer destino considerado.");
  } else if (opportunity.destination_state) {
    score += MATCH_SCORE_PESO_DESTINO;
    detalhes.push(`Destino confirmado (${opportunity.destination_state}).`);
  } else {
    score += MATCH_SCORE_PESO_DESTINO / 2;
    detalhes.push("Destino da oportunidade não confirmado.");
  }

  if (!veiculoBodyType || !opportunity.body_type) {
    score += MATCH_SCORE_PESO_CARROCERIA / 2;
    detalhes.push("Compatibilidade de carroceria não confirmada.");
  } else if (veiculoBodyType === opportunity.body_type) {
    score += MATCH_SCORE_PESO_CARROCERIA;
    detalhes.push(`Carroceria compatível (${opportunity.body_type}).`);
  } else {
    detalhes.push(`Carroceria da oportunidade (${opportunity.body_type}) diferente da do veículo (${veiculoBodyType}).`);
  }

  if (!opportunity.pickup_date) {
    score += MATCH_SCORE_PESO_DATA / 2;
    detalhes.push("Data da oportunidade não informada.");
  } else if (!radar.available_from && !radar.available_until) {
    score += MATCH_SCORE_PESO_DATA / 2;
    detalhes.push("Radar sem janela de data fixa.");
  } else {
    const dataOportunidade = opportunity.pickup_date;
    const dentroDeInicio = !radar.available_from || dataOportunidade >= radar.available_from;
    const dentroDeFim = !radar.available_until || dataOportunidade <= radar.available_until;
    if (dentroDeInicio && dentroDeFim) {
      score += MATCH_SCORE_PESO_DATA;
      detalhes.push("Data dentro da janela do radar.");
    } else {
      detalhes.push("Data fora da janela do radar.");
    }
  }

  return { score: Math.round(score), nivel: nivelParaScore(Math.round(score)), detalhes };
}
