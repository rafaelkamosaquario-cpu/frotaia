import type { NewsDigestRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/**
 * Histórico do resumo diário de notícias (Fase 11 do plano de unificação
 * V1+V2) — antes o resumo era gerado e mandado direto pelo WhatsApp, nunca
 * persistido, então o painel não tinha como mostrar "as notícias de hoje".
 */
export async function saveNewsDigest(client: SupabaseDbClient, content: string): Promise<NewsDigestRow> {
  const { data, error } = await client.from("news_digests").insert({ content }).select("*").single();
  if (error) throw error;
  return data;
}

export async function getLatestNewsDigest(client: SupabaseDbClient): Promise<NewsDigestRow | null> {
  const { data, error } = await client.from("news_digests").select("*").order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}
