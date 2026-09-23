import { advanceBalance, advanceSchema, type CostEntry } from "@/lib/frota/costs";
import type { SupabaseDbClient } from "./types";

export async function readCostEntry(db: SupabaseDbClient, companyId: string, id: string): Promise<CostEntry> {
  const { data, error } = await db.from("cost_entries").select("*").eq("company_id", companyId).eq("id", id).single();
  if (error) throw error;
  return data as CostEntry;
}

// Append only. CAS avoids lost advances and serializes against settlement/discard.
export async function registerCostAdvance(db: SupabaseDbClient, companyId: string, userId: string, raw: unknown, now = new Date()) {
  const input = advanceSchema.parse(raw);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (input.date > today) throw new Error("Informe a data de um vale já entregue, não uma data futura.");
  const entry = await readCostEntry(db, companyId, input.entryId);
  const previous = entry.snapshot.advances ?? [];
  const existing = previous.find(a => a.id === input.id);
  if (existing) {
    if (existing.amount !== input.amount || existing.date !== input.date || existing.note !== input.note) throw new Error("Esta identificação já foi usada para outro vale.");
    return { id: existing.id };
  }
  if (entry.paid_on) throw new Error("Este lançamento já foi quitado.");
  if (!entry.snapshot.person && !entry.snapshot.driverId) throw new Error("O vale precisa estar vinculado a uma pessoa.");
  if (Math.round(input.amount * 100) > Math.round(advanceBalance(entry).remaining * 100)) throw new Error("O vale ultrapassa o saldo deste lançamento.");
  const advance = { id: input.id, amount: input.amount, date: input.date, note: input.note, recordedAt: now.toISOString(), recordedBy: userId };
  const { data, error } = await db.from("cost_entries").update({ snapshot: { ...entry.snapshot, advances: [...previous, advance] } })
    .eq("company_id", companyId).eq("id", entry.id).filter("snapshot", "eq", JSON.stringify(entry.snapshot)).is("paid_on", null).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("O lançamento mudou durante a gravação. Recarregue e confira antes de tentar novamente.");
  return { id: input.id };
}
