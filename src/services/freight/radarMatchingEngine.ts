import "server-only";
import { calcularMatch } from "@/lib/freight/matching";
import { listAllActiveRadars } from "@/services/supabase/freightRadarService";
import { createMatch, markMatchNotified, markMatchAnalyzed } from "@/services/supabase/freightMatchService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { getActiveCostProfile } from "@/services/supabase/vehicleCostProfileService";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { listChannelsForCompany } from "@/services/supabase/channelIdentityService";
import { sendWhatsappText } from "@/lib/whatsapp/zapiClient";
import { startAnalysisRun, completeAnalysisRun, failAnalysisRun } from "@/services/supabase/analysisHistoryService";
import { getOrCreateOpenConversation, appendMessage } from "@/services/supabase/conversationService";
import { ferramentaConsultarRota, ferramentaCalcularCombustivel, ferramentaAnalisarFrete } from "@/ai/tools";
import type { FreightOpportunityRow, FreightRadarRow, VehicleRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "@/services/supabase/types";

/**
 * Radar de Fretes (MVP) — motor de matching + notificação. Chamado
 * imediatamente depois que uma oportunidade é criada (evento, não polling —
 * etapa 34 da spec). Roda em TODOS os radares ativos de TODAS as empresas
 * (freight_opportunities não é por empresa — ver comentário da migration),
 * mas o isolamento real acontece na hora de criar o match (sempre
 * `company_id` do radar) e ao notificar (só o WhatsApp da própria empresa).
 */
export async function processarNovaOportunidade(admin: SupabaseDbClient, opportunity: FreightOpportunityRow): Promise<{ matchesGerados: number; notificacoesEnviadas: number }> {
  const radares = await listAllActiveRadars(admin);
  let matchesGerados = 0;
  let notificacoesEnviadas = 0;

  for (const radar of radares) {
    const veiculo = radar.vehicle_id ? await getVehicle(admin, radar.vehicle_id) : null;
    const resultado = calcularMatch(radar, opportunity, veiculo?.body_type ?? null);
    if (resultado.nivel === "SEM_MATCH") continue;

    const match = await createMatch(admin, opportunity.id, radar.id, radar.company_id, radar.vehicle_id, resultado.score);
    if (!match) continue; // já existia (idempotência — mesma oportunidade não gera 2 matches pro mesmo radar)
    matchesGerados += 1;

    // Etapa 30 (anti-spam): só FORTE dispara notificação proativa no WhatsApp — PARCIAL fica disponível no painel/consultar_oportunidades_frete, sem incomodar o cliente.
    if (resultado.nivel !== "FORTE") continue;

    try {
      const preferencias = await getOrCreatePreferences(admin, radar.company_id);
      if (preferencias.freight_radar_analysis_mode === "analise_automatica" && veiculo) {
        await analisarOportunidadeParaMatch(admin, match.id, radar.company_id, opportunity, radar, veiculo);
      }

      const enviado = await notificarOportunidade(admin, radar, opportunity, match.id, resultado.score);
      if (enviado) {
        await markMatchNotified(admin, match.id);
        notificacoesEnviadas += 1;
      }
    } catch (err) {
      console.error(`[radar-matching] Falha ao processar match ${match.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[radar-matching] oportunidade=${opportunity.id} radaresAvaliados=${radares.length} matches=${matchesGerados} notificacoes=${notificacoesEnviadas}`);
  return { matchesGerados, notificacoesEnviadas };
}

/**
 * Além de mandar pelo WhatsApp, persiste a notificação como mensagem de
 * saída da conversa normal do cliente (mesma tabela que o chat usa) — sem
 * isso, quando o cliente responde "analisa" numa mensagem nova, a IA não
 * teria nenhum contexto de qual oportunidade ele quer dizer. `matchId` fica
 * em metadata (nunca no texto visível) para o caso de precisar recuperar.
 */
async function notificarOportunidade(admin: SupabaseDbClient, radar: FreightRadarRow, opportunity: FreightOpportunityRow, matchId: string, score: number): Promise<boolean> {
  const canais = await listChannelsForCompany(admin, radar.company_id);
  const canalWhatsapp = canais.find((c) => c.channel_type === "whatsapp" && c.phone_e164);
  if (!canalWhatsapp?.phone_e164) return false;

  const origem = [opportunity.origin_city, opportunity.origin_state].filter(Boolean).join(" - ") || "origem não informada";
  const destino = [opportunity.destination_city, opportunity.destination_state].filter(Boolean).join(" - ") || "destino não informado";
  const valor = opportunity.freight_value_cents ? `R$ ${(opportunity.freight_value_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "valor não informado";
  const peso = opportunity.weight_kg ? `${(opportunity.weight_kg / 1000).toLocaleString("pt-BR")} t` : null;

  const linhas = [
    "⚡ *Oportunidade de frete encontrada*",
    "",
    `${origem} → ${destino}`,
    valor,
    ...(peso ? [peso] : []),
    ...(opportunity.body_type ? [opportunity.body_type] : []),
    "",
    `Compatibilidade: ${score}% com o radar que você deixou ativo.`,
    "",
    "Pelos dados disponíveis, pode ser interessante — quer que eu faça a análise completa? Responda \"analisa\" ou \"ignora\".",
  ];
  const texto = linhas.join("\n");

  await sendWhatsappText(canalWhatsapp.phone_e164, texto);

  try {
    const conversa = await getOrCreateOpenConversation(admin, radar.company_id, radar.user_id, canalWhatsapp.id);
    await appendMessage(admin, {
      conversation_id: conversa.id,
      company_id: radar.company_id,
      user_id: radar.user_id,
      role: "assistant",
      direction: "outbound",
      content: texto,
      content_type: "text",
      metadata: { freightOpportunityMatchId: matchId },
    });
  } catch (err) {
    // Notificação já foi enviada de verdade — falha em persistir histórico não deve mascarar isso como erro.
    console.error(`[radar-matching] Falha ao persistir notificação no histórico (match ${matchId}): ${err instanceof Error ? err.message : String(err)}`);
  }

  return true;
}

/**
 * Análise financeira PRELIMINAR da oportunidade — reaproveita consultar_rota
 * + calcular_combustivel + analisar_frete (nunca um motor novo, etapa 2 da
 * spec). Escopo deliberadamente conservador pra rodar fora de conversa: só
 * considera custo de combustível (não pneus/manutenção/depreciação/
 * motorista, que dependem de composição mais complexa do perfil de custo) —
 * sempre rotulado como preliminar; a análise completa continua exigindo o
 * cliente pedir "analisa" numa conversa real, onde a IA compõe o cálculo
 * completo com todos os dados salvos.
 */
export async function analisarOportunidadeParaMatch(
  admin: SupabaseDbClient,
  matchId: string,
  companyId: string,
  opportunity: FreightOpportunityRow,
  radar: FreightRadarRow,
  veiculo: VehicleRow
): Promise<void> {
  const analysisRun = await startAnalysisRun(admin, companyId, {
    userId: radar.user_id,
    vehicleId: veiculo.id,
    analysisType: "radar_frete_pre_analise",
    userRequest: `Match automático do Radar de Fretes — oportunidade ${opportunity.id}`,
  });

  try {
    if (!opportunity.origin_city || !opportunity.destination_city) {
      throw new Error("Oportunidade sem origem/destino em texto suficiente para consultar rota.");
    }

    const rota = await ferramentaConsultarRota.executar({
      modo: "CALCULAR_DISTANCIA_ROTA",
      origem: [opportunity.origin_city, opportunity.origin_state].filter(Boolean).join(", "),
      destino: [opportunity.destination_city, opportunity.destination_state].filter(Boolean).join(", "),
    });
    if (!rota.sucesso || !rota.distanciaKm) throw new Error("Não foi possível calcular a rota para a pré-análise.");

    const custoProfile = await getActiveCostProfile(admin, veiculo.id);
    let custoTotalEstimado: number | undefined;
    if (veiculo.average_consumption_km_l && custoProfile?.fuel_price_per_liter) {
      const combustivel = await ferramentaCalcularCombustivel.executar({
        modo: "PREVISAO_VIAGEM",
        distanciaKm: rota.distanciaKm,
        consumoMedioKmLitro: veiculo.average_consumption_km_l,
        precoCombustivelLitro: custoProfile.fuel_price_per_liter,
      });
      custoTotalEstimado = combustivel.resultados.custoTotalCombustivel;
    }

    const analise = await ferramentaAnalisarFrete.executar({
      modo: "ANALISE_SIMPLES",
      distanciaIdaKm: rota.distanciaKm,
      valorFreteTotal: opportunity.freight_value_cents ? opportunity.freight_value_cents / 100 : undefined,
      custoTotal: custoTotalEstimado,
      pesoCargaToneladas: opportunity.weight_kg ? opportunity.weight_kg / 1000 : undefined,
      observacoes: "Estimativa PRELIMINAR (só custo de combustível) gerada automaticamente pelo Radar de Fretes — não inclui pneus/manutenção/depreciação/motorista. Peça a análise completa no chat para considerar todos os custos salvos do veículo.",
    });

    await completeAnalysisRun(admin, analysisRun.id, analise.mensagemResumo, analise as unknown as Record<string, unknown>);
    await markMatchAnalyzed(admin, matchId, companyId, analysisRun.id);
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await failAnalysisRun(admin, analysisRun.id, "RADAR_PRE_ANALISE_FALHOU", "Não foi possível concluir a pré-análise automática desta oportunidade.");
    console.error(`[radar-matching] Falha na pré-análise do match ${matchId}: ${mensagem}`);
  }
}
