import { channelIdentitySchema } from "@/lib/validation/schemas";
import { toJson } from "@/lib/supabase/json";
import type { UserChannelRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/**
 * Localiza o canal (ex.: WhatsApp) pelo par provider + external_user_id.
 * Usado pelo fluxo de entrada do WhatsApp — normalmente chamado com o
 * client admin (a mensagem chega antes de qualquer sessão autenticada).
 */
export async function findChannelByExternalId(
  client: SupabaseDbClient,
  provider: UserChannelRow["provider"],
  externalUserId: string
): Promise<UserChannelRow | null> {
  const { data, error } = await client
    .from("user_channels")
    .select("*")
    .eq("provider", provider)
    .eq("external_user_id", externalUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listChannelsForUser(client: SupabaseDbClient, userId: string): Promise<UserChannelRow[]> {
  const { data, error } = await client.from("user_channels").select("*").eq("user_id", userId);
  if (error) throw error;
  return data ?? [];
}

/** Canais (ex.: WhatsApp) de todos os usuários de uma empresa — usado pelo despacho de notícias diárias, que é uma preferência por empresa (company_preferences), não por usuário. */
export async function listChannelsForCompany(client: SupabaseDbClient, companyId: string): Promise<UserChannelRow[]> {
  const { data, error } = await client.from("user_channels").select("*").eq("company_id", companyId);
  if (error) throw error;
  return data ?? [];
}

/**
 * Vincula todos os canais (ex.: WhatsApp) de um usuário à empresa dele —
 * chamado logo depois que a empresa é criada no onboarding. Sem isso,
 * user_channels.company_id fica sempre nulo pra quem entrou pelo WhatsApp
 * (o canal é criado no primeiro contato, antes de existir empresa — só a
 * ligação via company_members existia até aqui), quebrando qualquer busca
 * de canal por empresa (listChannelsForCompany), usada pelos despachos de
 * notícia diária e aviso de teste grátis. Achado em produção em 07/08/2026.
 */
export async function setCompanyForUserChannels(client: SupabaseDbClient, userId: string, companyId: string): Promise<void> {
  const { error } = await client.from("user_channels").update({ company_id: companyId }).eq("user_id", userId);
  if (error) throw error;
}

export async function linkChannel(
  client: SupabaseDbClient,
  userId: string,
  companyId: string | null,
  input: unknown
): Promise<UserChannelRow> {
  const parsed = channelIdentitySchema.parse(input);

  const { data, error } = await client
    .from("user_channels")
    .insert({
      user_id: userId,
      company_id: companyId,
      channel_type: parsed.channelType,
      provider: parsed.provider,
      external_user_id: parsed.externalUserId,
      phone_e164: parsed.phoneE164,
      display_name: parsed.displayName,
      metadata: toJson(parsed.metadata),
      verified: false,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
