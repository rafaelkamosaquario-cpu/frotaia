import type { ChecklistDispatchRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

/** Só leitura — não existe automação de envio ainda (fase futura, precisa de cron + WhatsApp), então nunca há escrita a partir do painel. */
export async function listChecklistDispatchesForPanel(
  client: SupabaseDbClient,
  companyId: string
): Promise<ChecklistDispatchRow[]> {
  const { data, error } = await client
    .from("checklist_dispatches")
    .select("*")
    .eq("company_id", companyId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
