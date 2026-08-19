import "server-only";
import { avaliarPossivelFrete } from "@/lib/freight/cheapFilter";
import { extrairOportunidadeDeTexto } from "@/services/freight/opportunityExtraction";
import { isGroupAuthorized } from "@/services/supabase/freightSourceService";
import { createOpportunity, findOpportunitySimilarRecent } from "@/services/supabase/freightOpportunityService";
import { processarNovaOportunidade } from "@/services/freight/radarMatchingEngine";
import type { SupabaseDbClient } from "@/services/supabase/types";

/**
 * Radar de Fretes (MVP) — entrada de mensagens de GRUPO de WhatsApp. Nunca
 * cria auth.user, nunca inicia onboarding, nunca vira conversation/message
 * (etapa 50 da spec: participante de grupo NUNCA é cliente Frota IA) — só
 * alimenta o Radar quando o grupo está na whitelist (freight_sources) e a
 * mensagem passa no pré-filtro barato antes de qualquer chamada à IA.
 *
 * Chamado direto do webhook, de forma síncrona ao evento (etapa 34: evento
 * é melhor que polling) — nunca responde no grupo (etapa 51).
 */
export async function processarMensagemDeGrupo(
  admin: SupabaseDbClient,
  groupExternalId: string,
  groupName: string | undefined,
  texto: string,
  messageId: string | undefined,
  rawPayload: unknown
): Promise<void> {
  const autorizado = await isGroupAuthorized(admin, groupExternalId);
  if (!autorizado) {
    console.log(`[freight-radar] estagio=grupo_nao_autorizado grupo=${groupExternalId}`);
    return;
  }

  const avaliacao = avaliarPossivelFrete(texto);
  if (!avaliacao.parecePossivelFrete) {
    console.log(`[freight-radar] estagio=descartado_prefiltro pontuacao=${avaliacao.pontuacao}`);
    return;
  }

  const dataDeHoje = new Date().toISOString().slice(0, 10);
  const extracao = await extrairOportunidadeDeTexto(texto, dataDeHoje);
  if (!extracao || !extracao.pareceOfertaDeFrete) {
    console.log("[freight-radar] estagio=descartado_extracao");
    return;
  }

  const duplicataSimilar = await findOpportunitySimilarRecent(admin, groupExternalId, extracao.originState, extracao.destinationState, extracao.freightValueCents);
  if (duplicataSimilar) {
    console.log(`[freight-radar] estagio=descartado_dedup_similaridade oportunidadeExistente=${duplicataSimilar.id}`);
    return;
  }

  const oportunidade = await createOpportunity(admin, {
    source: "whatsapp_group",
    sourceGroupId: groupExternalId,
    sourceGroupName: groupName ?? null,
    originalMessageId: messageId ?? null,
    originalText: texto,
    extracao,
    rawPayload,
  });

  if (!oportunidade) {
    console.log("[freight-radar] estagio=descartado_dedup_exato");
    return;
  }

  const { matchesGerados, notificacoesEnviadas } = await processarNovaOportunidade(admin, oportunidade);
  console.log(`[freight-radar] estagio=oportunidade_criada opportunidadeId=${oportunidade.id} matches=${matchesGerados} notificacoes=${notificacoesEnviadas}`);
}
