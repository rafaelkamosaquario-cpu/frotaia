import type { CalendarActionLogInsert, GoogleIntegrationRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/**
 * Google Calendar é uma integração POR EMPRESA (não por usuário) — decisão
 * da unificação de identidade WhatsApp+Painel: os dois canais podem
 * resolver `userId`s diferentes pra mesma pessoa real, mas sempre a mesma
 * `companyId` uma vez vinculados (ver company_members). Busca a integração
 * ativa mais recente da empresa; ignora conexões já revogadas.
 */
export async function getGoogleIntegration(
  client: SupabaseDbClient,
  companyId: string
): Promise<GoogleIntegrationRow | null> {
  const { data, error } = await client
    .from("google_integrations")
    .select("*")
    .eq("company_id", companyId)
    .neq("connection_status", "revoked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Cria ou atualiza o metadado (não sensível) da conexão Google da empresa.
 * NUNCA recebe/grava access_token ou refresh_token — essa tabela não tem
 * coluna para isso (ver migration 4 e a documentação da Camada 3).
 *
 * Uma empresa tem no máximo 1 conexão ativa: em vez de depender de
 * constraint única + upsert por `onConflict` (a constraint real da tabela
 * ainda é `(user_id, google_account_email)`, que não reflete mais a regra
 * de negócio), busca a integração existente da empresa e atualiza essa
 * linha; só insere uma nova se a empresa nunca conectou nada antes.
 */
export async function upsertGoogleIntegrationStatus(
  client: SupabaseDbClient,
  userId: string,
  companyId: string,
  googleAccountEmail: string,
  input: Partial<
    Pick<
      GoogleIntegrationRow,
      "google_subject_id" | "calendar_enabled" | "default_calendar_id" | "granted_scopes" | "connection_status" | "token_expires_at"
    >
  >
): Promise<GoogleIntegrationRow> {
  const existing = await getGoogleIntegration(client, companyId);

  if (existing) {
    const { data, error } = await client
      .from("google_integrations")
      .update({ user_id: userId, google_account_email: googleAccountEmail, ...input })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await client
    .from("google_integrations")
    .insert({ user_id: userId, company_id: companyId, google_account_email: googleAccountEmail, ...input })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function recordCalendarAction(
  client: SupabaseDbClient,
  input: CalendarActionLogInsert
): Promise<void> {
  const { error } = await client.from("calendar_action_logs").insert(input);
  if (error) throw error;
}
