import { z } from "zod";
import { aiMemoryCreateSchema } from "@/lib/validation/schemas";
import { getProfile } from "@/services/supabase/profileService";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { getVehicle, resolveDefaultVehicle as resolveDefaultVehicleRow } from "@/services/supabase/vehicleService";
import { getActiveCostProfile } from "@/services/supabase/vehicleCostProfileService";
import { listTireProfiles } from "@/services/supabase/vehicleTireProfileService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { saveMemory, listMemoriesForPrompt } from "@/services/supabase/memoryService";
import { recordToolExecution } from "@/services/supabase/toolExecutionService";
import type { SupabaseDbClient } from "@/services/supabase/types";
import type {
  AiMemoryRow,
  CompanyMemberRole,
  CompanyPreferencesRow,
  CompanyRow,
  ProfileRow,
  VehicleCostProfileRow,
  VehicleRow,
  VehicleTireProfileRow,
} from "@/lib/supabase/tables";
import type { FrotaIaToolName } from "@/lib/supabase/tables";

/**
 * Camada de contexto entre o Supabase e as 11 ferramentas puras de
 * src/ai/tools. Nenhuma ferramenta importa isto — é sempre o chamador
 * (rota da API / fluxo do WhatsApp) que monta a `entrada` da ferramenta a
 * partir do que este módulo carrega. Isso preserva as ferramentas puras e
 * testáveis (ver src/ai/tools/README.md).
 *
 * Precedência ao resolver um valor (nunca inventar um dado faltante):
 * 1. valor informado na mensagem atual;
 * 2. valor confirmado recentemente pelo usuário;
 * 3. perfil ativo do veículo (vehicle_cost_profiles / vehicle_tire_profiles);
 * 4. preferência da empresa (company_preferences);
 * 5. memória ativa confiável (ai_memories);
 * 6. perguntar ao usuário.
 * Esse merge é responsabilidade de quem monta a entrada da ferramenta —
 * este módulo só entrega os dados brutos de cada camada.
 *
 * `memories` (nível 5 acima) é sempre AUXILIAR: nunca sobrescreve um dado
 * estruturado (perfil de veículo/custo/pneu, preferência) quando os dois
 * existirem — ver a regra de hierarquia de fontes no system prompt
 * (construirSystemPrompt). O merge automático de dado estruturado dentro de
 * ai_memories nunca acontece aqui nem em lugar nenhum — é dado
 * complementar, guardado só pela ferramenta gerenciar_memoria ou pelo
 * onboarding (finalizeOnboarding.ts).
 */

export interface CustomerContext {
  profile: ProfileRow | null;
  company: CompanyRow | null;
  role: CompanyMemberRole | null;
  preferences: CompanyPreferencesRow | null;
  memories: AiMemoryRow[];
}

export async function loadCustomerContext(client: SupabaseDbClient, userId: string): Promise<CustomerContext> {
  const profile = await getProfile(client, userId);

  const { data: membership, error } = await client
    .from("company_members")
    .select("role, companies(*)")
    .eq("user_id", userId)
    .eq("is_default", true)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;

  if (!membership || !membership.companies) {
    return { profile, company: null, role: null, preferences: null, memories: [] };
  }

  const company = membership.companies as CompanyRow;
  const preferences = await getOrCreatePreferences(client, company.id);
  const memories = await listMemoriesForPrompt(client, company.id, userId);
  // Log mínimo por desenho: só a contagem, nunca o conteúdo da memória (pode ter dado sensível do cliente).
  console.log(`[customerContext] memórias carregadas para o prompt: ${memories.length}`);

  return { profile, company, role: membership.role, preferences, memories };
}

export interface VehicleContext {
  vehicle: VehicleRow | null;
  costProfile: VehicleCostProfileRow | null;
  tireProfiles: VehicleTireProfileRow[];
  /** Fonte única desde a Fase 4 do plano de unificação V1+V2: vehicle_documents (tipos 'seguro'/'licenciamento'), não mais vehicles.insurance_expiry_date/licensing_expiry_date. */
  insuranceExpiryDate: string | null;
  licensingExpiryDate: string | null;
}

/** Se vehicleId não for informado, usa o veículo padrão (is_default) da empresa. */
export async function loadVehicleContext(
  client: SupabaseDbClient,
  companyId: string,
  vehicleId?: string
): Promise<VehicleContext> {
  const vehicle = vehicleId ? await getVehicle(client, vehicleId) : await resolveDefaultVehicleRow(client, companyId);

  if (!vehicle) {
    return { vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null };
  }

  const [costProfile, tireProfiles, documentos] = await Promise.all([
    getActiveCostProfile(client, vehicle.id),
    listTireProfiles(client, vehicle.id),
    listVehicleDocumentsForPanel(client, companyId),
  ]);

  const insuranceExpiryDate = documentos.find((d) => d.vehicle_id === vehicle.id && d.document_type === "seguro")?.expiry_date ?? null;
  const licensingExpiryDate = documentos.find((d) => d.vehicle_id === vehicle.id && d.document_type === "licenciamento")?.expiry_date ?? null;

  return { vehicle, costProfile, tireProfiles, insuranceExpiryDate, licensingExpiryDate };
}

export const resolveDefaultVehicle = resolveDefaultVehicleRow;

export { startAnalysisRun as saveAnalysisRun } from "@/services/supabase/analysisHistoryService";

/**
 * Executa qualquer uma das ferramentas (as 11 puras e as de integração
 * assíncronas — Agenda, alertas, veículo, rota, histórico, conhecimento
 * operacional etc.) e registra a execução em tool_executions, medindo a
 * duração real. Não altera o resultado da ferramenta de forma alguma — só
 * mede e grava em volta dela.
 *
 * `executar()` é sempre aguardado (await), mesmo quando a ferramenta é
 * síncrona (await sobre um valor não-Promise só resolve na hora, sem
 * custo) — antes disso, ferramentas `async` (ex.:
 * consultar_conhecimento_operacional, que lê arquivo do disco) tinham o
 * resultado tratado como se já estivesse pronto: a Promise não resolvida
 * ia parar em `outputData` (grava lixo em tool_executions) e podia
 * derrubar `recordToolExecution` ao tentar serializar isso, fazendo a
 * ferramenta "falhar" mesmo com a lógica interna dela funcionando
 * perfeitamente — foi exatamente o que aconteceu em teste real no
 * WhatsApp (05/08/2026).
 */
export async function saveToolExecution<TSaida>(
  client: SupabaseDbClient,
  companyId: string,
  params: {
    userId: string;
    toolName: FrotaIaToolName;
    inputData: Record<string, unknown>;
    analysisRunId?: string;
    conversationId?: string;
    messageId?: string;
    toolVersion?: string;
  },
  executar: () => TSaida | Promise<TSaida>
): Promise<TSaida> {
  const start = performance.now();

  try {
    const output = await executar();
    const durationMs = Math.round(performance.now() - start);

    await recordToolExecution(
      client,
      companyId,
      {
        userId: params.userId,
        toolName: params.toolName,
        inputData: params.inputData,
        analysisRunId: params.analysisRunId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        toolVersion: params.toolVersion,
      },
      { outputData: output as Record<string, unknown>, durationMs }
    );

    return output;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);

    await recordToolExecution(
      client,
      companyId,
      {
        userId: params.userId,
        toolName: params.toolName,
        inputData: params.inputData,
        analysisRunId: params.analysisRunId,
        conversationId: params.conversationId,
        messageId: params.messageId,
        toolVersion: params.toolVersion,
      },
      {
        outputData: {},
        durationMs,
        errorCode: "EXECUTION_ERROR",
        errorMessageSafe: "Falha ao executar a ferramenta. Detalhes técnicos não são persistidos aqui por segurança.",
      }
    );

    throw err;
  }
}

type ConfirmedMemoryInput = Omit<z.infer<typeof aiMemoryCreateSchema>, "sourceType" | "confirmedByUser">;

/** Variante de saveMemory para quando o cliente confirmou o dado explicitamente. */
export async function saveConfirmedMemory(
  client: SupabaseDbClient,
  companyId: string,
  userId: string,
  input: ConfirmedMemoryInput
) {
  return saveMemory(client, companyId, userId, {
    ...input,
    sourceType: "user_explicit",
    confirmedByUser: true,
  });
}
