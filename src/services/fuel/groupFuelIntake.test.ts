import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseDbClient } from "@/services/supabase/types";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ send: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappGroupText: mocks.send }));
vi.mock("./fuelImageExtraction", () => ({ extractFuelEvidence: mocks.extract }));
import { processGroupFuel } from "./groupFuelIntake";
const company = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const evidence = { vehicle: "ABC1D23", driver: "Condutor", date: "2026-09-21", liters: 162, meter: 16777, meterKind: "km" };
const draft = { company_id: company, draft_id: id, revision: 2, evidence };
function database(active = true) {
  const filters: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const value = table === "company_members" ? active ? { role: "owner" } : null : table === "vehicles" ? [{ id, name: "Caminhão", plate: "ABC1D23" }] : table === "drivers" ? [{ id, name: "Condutor" }] : draft;
    const query = { select: vi.fn(() => query), eq: vi.fn((...args: unknown[]) => { filters.push([table, ...args]); return query; }), maybeSingle: vi.fn(async () => ({ data: value, error: null })), limit: vi.fn(async () => ({ data: value, error: null })) };
    return query;
  });
  const rpc = vi.fn(async () => ({ data: draft, error: null }));
  return { client: { from, rpc } as unknown as SupabaseDbClient, from, rpc, filters };
}
const input = { phone: "123456-group", participantPhone: "5542998006380", messageId: "m1", text: { message: "RESUMO" } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FUEL_GROUP_ENABLED", "true");
  vi.stubEnv("FUEL_GROUP_BINDINGS", JSON.stringify([{ groupId: input.phone, companyId: company, operatorId: user, senders: [input.participantPhone], dryRun: true }]));
});
afterEach(() => vi.unstubAllEnvs());
describe("group fuel pilot", () => {
  it("does nothing when disabled", async () => { vi.stubEnv("FUEL_GROUP_ENABLED", "false"); const db = database(); expect(await processGroupFuel(db.client, input)).toBe(false); expect(db.from).not.toHaveBeenCalled(); });
  it("ignores other groups", async () => { const db = database(); expect(await processGroupFuel(db.client, { ...input, phone: "999-group" })).toBe(false); expect(db.from).not.toHaveBeenCalled(); });
  it("silently consumes unauthorized sender without listing company data", async () => { const db = database(); expect(await processGroupFuel(db.client, { ...input, participantPhone: "5542999999999" })).toBe(true); expect(db.from).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled(); });
  it("rejects inactive delegate", async () => { const db = database(false); await processGroupFuel(db.client, input); expect(db.filters).toContainEqual(["company_members", "status", "active"]); expect(db.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled(); });
  it("scopes vehicle and driver options to company and sends no prices", async () => { const db = database(); await processGroupFuel(db.client, input); expect(db.filters).toContainEqual(["vehicles", "company_id", company]); expect(db.filters).toContainEqual(["drivers", "company_id", company]); expect(mocks.send.mock.calls[0][1]).toContain("CONFIRMAR"); expect(mocks.send.mock.calls[0][1]).not.toContain("R$"); });
  it("confirms only in dry run, with server-controlled tenant and sender", async () => { const db = database(); await processGroupFuel(db.client, { ...input, text: { message: "CONFIRMAR 33333333-2" } }); expect(db.rpc).toHaveBeenCalledWith("fuel_group_step", expect.objectContaining({ p_dry_run: true, p_company: company, p_user: user, p_sender: input.participantPhone, p_action: "confirm" })); expect(mocks.send.mock.calls[0][1]).toContain("Simulação confirmada"); });
  it("does not confirm stale revision", async () => { const db = database(); await processGroupFuel(db.client, { ...input, text: { message: "CONFIRMAR 33333333-1" } }); expect(db.rpc).not.toHaveBeenCalled(); });
  it("does not announce success on database failure", async () => { const db = database(); db.rpc.mockResolvedValueOnce({ data: null, error: { message: "failure" } } as never); await processGroupFuel(db.client, { ...input, text: { message: "CONFIRMAR 33333333-2" } }); expect(mocks.send.mock.calls[0][1]).toContain("Não foi possível confirmar"); });
  it("asks for text when image cannot be read, without saving draft", async () => { const db = database(); mocks.extract.mockRejectedValueOnce(new Error("unreadable")); await processGroupFuel(db.client, { ...input, text: undefined, image: { imageUrl: "https://media.invalid/image.jpg" } }); expect(db.rpc).not.toHaveBeenCalled(); expect(mocks.send.mock.calls[0][1]).toContain("Não consegui identificar"); });
});
