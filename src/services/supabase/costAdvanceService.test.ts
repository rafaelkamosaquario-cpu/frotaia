import { describe, expect, it, vi } from "vitest";
import { advanceBalance, advanceSchema, type CostEntry } from "@/lib/frota/costs";
import { registerCostAdvance } from "./costAdvanceService";
import type { SupabaseDbClient } from "./types";
const id = "00000000-0000-4000-8000-000000000001";
const input = { id, entryId: id, amount: 500, date: "2026-09-22", note: "Vale" };
const now = new Date("2026-09-22T18:00:00Z");
const entry = () => ({ id, amount: 3700, snapshot: { person: "Pessoa", advances: [] }, paid_on: null }) as unknown as CostEntry;
function db(row: CostEntry, changed = false) {
  const q = { select: vi.fn(), eq: vi.fn(), filter: vi.fn(), is: vi.fn(), single: vi.fn().mockResolvedValue({ data: row, error: null }), update: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: changed ? null : { id }, error: null }) };
  for (const method of [q.select, q.eq, q.filter, q.is, q.update]) method.mockReturnValue(q);
  return { client: { from: vi.fn().mockReturnValue(q) } as unknown as SupabaseDbClient, q };
}
describe("vales por pessoa e lançamento", () => {
  it("preserva custo e snapshot, descontando apenas saldo", async () => {
    const row = entry(); const d = db(row);
    await registerCostAdvance(d.client, "company", "user", input, now);
    const saved = d.q.update.mock.calls[0][0];
    expect(Object.keys(saved)).toEqual(["snapshot"]);
    expect(saved.snapshot.person).toBe("Pessoa");
    expect(saved.snapshot.advances[0]).toMatchObject({ amount: 500, recordedBy: "user" });
    expect(advanceBalance({ ...row, snapshot: saved.snapshot })).toEqual({ advanced: 500, remaining: 3200 });
    expect(d.q.eq).toHaveBeenCalledWith("company_id", "company");
    expect(d.q.filter).toHaveBeenCalledWith("snapshot", "eq", JSON.stringify(row.snapshot));
    expect(d.q.is).toHaveBeenCalledWith("paid_on", null);
  });
  it("soma múltiplos vales em centavos e mantém pessoas separadas", () => {
    const a = entry(); a.amount = 1; a.snapshot.advances = [{ amount: .1 }, { amount: .2 }] as NonNullable<CostEntry["snapshot"]["advances"]>;
    expect(advanceBalance(a)).toEqual({ advanced: .3, remaining: .7 });
    expect(advanceBalance(entry())).toEqual({ advanced: 0, remaining: 3700 });
    expect(advanceBalance({ ...a, paid_on: "2026-09-22" }).remaining).toBe(0);
  });
  it.each([0, -1, 500.001, Infinity])("rejeita valor %s", amount => expect(advanceSchema.safeParse({ ...input, amount }).success).toBe(false));
  it("rejeita data futura", async () => { const d = db(entry()); await expect(registerCostAdvance(d.client, "c", "u", { ...input, date: "2026-09-23" }, now)).rejects.toThrow("futura"); expect(d.q.update).not.toHaveBeenCalled(); });
  it("rejeita saldo insuficiente", async () => { const d = db(entry()); await expect(registerCostAdvance(d.client, "c", "u", { ...input, amount: 3700.01 }, now)).rejects.toThrow("saldo"); expect(d.q.update).not.toHaveBeenCalled(); });
  it("rejeita quitado", async () => { const d = db({ ...entry(), paid_on: "2026-09-22" }); await expect(registerCostAdvance(d.client, "c", "u", input, now)).rejects.toThrow("quitado"); });
  it("não duplica uma repetição de requisição", async () => { const row = entry(); row.snapshot.advances = [{ ...input, recordedAt: now.toISOString(), recordedBy: "u" }]; const d = db(row); await registerCostAdvance(d.client, "c", "u", input, now); expect(d.q.update).not.toHaveBeenCalled(); });
  it("não aceita reutilizar chave com outro valor", async () => { const row = entry(); row.snapshot.advances = [{ ...input, recordedAt: now.toISOString(), recordedBy: "u" }]; const d = db(row); await expect(registerCostAdvance(d.client, "c", "u", { ...input, amount: 600 }, now)).rejects.toThrow("outro vale"); });
  it("falha com conflito sem sobrescrever alteração concorrente", async () => { const d = db(entry(), true); await expect(registerCostAdvance(d.client, "c", "u", input, now)).rejects.toThrow("mudou"); });
  it("exige pessoa", async () => { const row = entry(); row.snapshot.person = ""; const d = db(row); await expect(registerCostAdvance(d.client, "c", "u", input, now)).rejects.toThrow("pessoa"); });
});
