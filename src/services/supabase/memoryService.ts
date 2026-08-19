import { aiMemoryCreateSchema } from "@/lib/validation/schemas";
import { toJson } from "@/lib/supabase/json";
import type { AiMemoryRow, AiMemoryTypeEnum } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/**
 * Quantas memórias ativas entram no system prompt por chamada — mantém o
 * custo de tokens previsível mesmo se uma empresa acumular muitas memórias
 * ao longo do tempo. As mais recentes (updated_at desc) ganham prioridade;
 * o restante continua no banco, só não entra no prompt daquela rodada.
 */
export const MAX_MEMORIES_IN_PROMPT = 12;

/**
 * Memórias que entram no system prompt: sempre as de EMPRESA (user_id nulo,
 * visíveis a todos os membros) somadas às PESSOAIS do usuário atual
 * (user_id = userId) — nunca a memória pessoal de outro membro da mesma
 * empresa. Usada por loadCustomerContext, que já é o ponto compartilhado
 * entre WhatsApp e painel (gerarRespostaAssistente monta o prompt a partir
 * do CustomerContext, não importa o canal).
 */
export async function listMemoriesForPrompt(client: SupabaseDbClient, companyId: string, userId: string): Promise<AiMemoryRow[]> {
  const { data, error } = await client
    .from("ai_memories")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(MAX_MEMORIES_IN_PROMPT);

  if (error) throw error;
  return data ?? [];
}

export async function listActiveMemories(
  client: SupabaseDbClient,
  companyId: string,
  memoryType?: AiMemoryTypeEnum
): Promise<AiMemoryRow[]> {
  let query = client
    .from("ai_memories")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (memoryType) query = query.eq("memory_type", memoryType);

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Salva uma memória nova. Se já existir uma memória ATIVA com a mesma
 * (company_id, memory_type, key), marca a antiga como 'superseded' em vez
 * de sobrescrever silenciosamente — histórico de correções fica preservado.
 */
export async function saveMemory(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  input: unknown
): Promise<AiMemoryRow> {
  const parsed = aiMemoryCreateSchema.parse(input);

  // Dedup por (company_id, user_id, memory_type, key): uma memória de
  // EMPRESA (userId ausente) nunca é substituída por uma PESSOAL de um
  // membro específico, e vice-versa, mesmo com a mesma key — são escopos
  // diferentes por definição.
  let buscaAnterior = client
    .from("ai_memories")
    .select("id")
    .eq("company_id", companyId)
    .eq("memory_type", parsed.memoryType)
    .eq("key", parsed.key)
    .eq("status", "active");
  buscaAnterior = parsed.userId ? buscaAnterior.eq("user_id", parsed.userId) : buscaAnterior.is("user_id", null);

  const { data: previous, error: findError } = await buscaAnterior.maybeSingle();

  if (findError) throw findError;

  if (previous) {
    const { error: supersedeError } = await client
      .from("ai_memories")
      .update({ status: "superseded", updated_by: userId })
      .eq("id", previous.id);
    if (supersedeError) throw supersedeError;
  }

  const { data, error } = await client
    .from("ai_memories")
    .insert({
      company_id: companyId,
      user_id: parsed.userId,
      vehicle_id: parsed.vehicleId,
      conversation_id: parsed.conversationId,
      memory_type: parsed.memoryType,
      key: parsed.key,
      value_json: toJson(parsed.valueJson),
      summary: parsed.summary,
      source_type: parsed.sourceType,
      source_message_id: parsed.sourceMessageId,
      confidence: parsed.confidence,
      confirmed_by_user: parsed.confirmedByUser ?? false,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function rejectMemory(client: SupabaseDbClient, memoryId: string, userId: string): Promise<void> {
  const { error } = await client
    .from("ai_memories")
    .update({ status: "rejected", updated_by: userId })
    .eq("id", memoryId);
  if (error) throw error;
}

/** Soft delete: nunca remove a linha, só marca status = 'deleted'. */
export async function deleteMemory(client: SupabaseDbClient, memoryId: string, userId: string): Promise<void> {
  const { error } = await client
    .from("ai_memories")
    .update({ status: "deleted", updated_by: userId })
    .eq("id", memoryId);
  if (error) throw error;
}

/**
 * "Esquecer" por (memory_type, key) em vez de id — a ferramenta de IA nunca
 * recebe/expõe o uuid interno da memória ao modelo, só a categoria e a
 * chave que ela mesma devolveu numa consulta anterior. `escopo` decide se
 * busca a memória de EMPRESA (user_id nulo) ou a PESSOAL do próprio userId.
 */
export async function forgetMemoryByKey(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  memoryType: AiMemoryTypeEnum,
  key: string,
  escopo: "empresa" | "usuario"
): Promise<boolean> {
  let busca = client
    .from("ai_memories")
    .select("id")
    .eq("company_id", companyId)
    .eq("memory_type", memoryType)
    .eq("key", key)
    .eq("status", "active");
  busca = escopo === "usuario" ? busca.eq("user_id", userId) : busca.is("user_id", null);

  const { data, error } = await busca.maybeSingle();
  if (error) throw error;
  if (!data) return false;

  await deleteMemory(client, data.id, userId);
  return true;
}
