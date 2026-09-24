import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { emptyFuelEvidence } from "@/lib/frota/fuelGroup";
import { newTruckFlow, truckToken, type TruckFlow } from "@/lib/frota/fuelTruckFlow";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ send: vi.fn(), buttons: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappGroupText: mocks.send, sendWhatsappGroupButtons: mocks.buttons }));
vi.mock("./fuelImageExtraction", () => ({ extractFuelEvidence: mocks.extract }));
import { processGroupFuel } from "./groupFuelIntake";
const company = "11111111-1111-4111-8111-111111111111", user = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333";
const input = { phone: "123456-group", participantPhone: "5542998006380", messageId: "m1", text: { message: "RESUMO" } };
function database(active = true, initial: TruckFlow = newTruckFlow(), drivers = [{ id, name: "Condutor" }], vehicles = [{ id, name: "Caminhão", plate: "ABC1D23" }]) {
  let draft = { draft_id: id, revision: 1, evidence: { truckFlow: initial }, updated_at: new Date().toISOString() };
  const filters: unknown[][] = [], seen = new Set<string>();
  const from = vi.fn((table: string) => {
    const value = table === "company_members" ? active ? { role: "owner" } : null : table === "vehicles" ? vehicles : table === "drivers" ? drivers : structuredClone(draft);
    const q = { select: vi.fn(() => q), eq: vi.fn((...args: unknown[]) => { filters.push([table, ...args]); return q; }), maybeSingle: vi.fn(async () => ({ data: value, error: null })), limit: vi.fn(async () => ({ data: value, error: null })) };
    return q;
  });
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => {
    if (seen.has(String(args.p_message))) return { data: { duplicate: true }, error: null };
    seen.add(String(args.p_message));
    if (args.p_action === "confirm") return { data: { confirmed: true }, error: null };
    draft = { ...draft, revision: draft.revision + 1, evidence: args.p_patch as typeof draft.evidence };
    return { data: structuredClone(draft), error: null };
  });
  return { client: { from, rpc } as unknown as SupabaseDbClient, from, rpc, filters, current: () => draft };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FUEL_GROUP_ENABLED", "true");
  vi.stubEnv("FUEL_GROUP_BINDINGS", JSON.stringify([{ groupId: input.phone, companyId: company, operatorId: user, senders: [input.participantPhone], dryRun: true }]));
});
afterEach(() => vi.unstubAllEnvs());
const ready = (): TruckFlow => ({ ...newTruckFlow(), liters: 162, meter: 16755.9, plate: "ABC1D23", confirmed: { liters: true, meter: true, plate: true } });
describe("interactive truck fuel intake", () => {
  it("simulates equipment without plate or hour meter using registered options", async () => {
    const db = database(true, newTruckFlow(), [{ id, name: "Marcelo" }], [
      { id, name: "Trator Munck BM125", plate: "" },
      { id: user, name: "Trator Valmet", plate: "" },
      { id: company, name: "Trator Guincho", plate: "" },
    ]);
    await processGroupFuel(db.client, { ...input, text: { message: "NOVO EQUIPAMENTO" } });
    await processGroupFuel(db.client, { ...input, messageId: "liters", text: { message: "40 litros" } });
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Qual equipamento");
    let buttons = mocks.buttons.mock.calls.at(-1)![2];
    await processGroupFuel(db.client, { ...input, messageId: "more-equip", text: undefined, buttonReply: { id: buttons.at(-1).id } });
    buttons = mocks.buttons.mock.calls.at(-1)![2];
    expect(buttons[0].label).toBe("Trator Guincho");
    await processGroupFuel(db.client, { ...input, messageId: "equip", text: undefined, buttonReply: { id: buttons[0].id } });
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Identifique-se como responsável");
    const driver = mocks.buttons.mock.calls.at(-1)![2][0];
    await processGroupFuel(db.client, { ...input, messageId: "driver", text: undefined, buttonReply: { id: driver.id } });
    expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_action: "confirm", p_dry_run: true, p_command: { liters: 40, vehicleId: company, meter: null, meterKind: null } });
    const receipt = mocks.send.mock.calls.at(-1)![1];
    expect(receipt).toContain("✅ Equipamento: Trator Guincho\n✅ Responsável: Marcelo");
    expect(receipt).toContain("Simulação concluída");
    expect(mocks.send.mock.calls.map(c => c[1]).join(" ")).not.toMatch(/odômetro|horímetro|foto da placa/i);
  });
  it("resolves equipment from photo evidence but never sends a no-meter command to live stock", async () => {
    const db = database(true, { ...newTruckFlow(), equipmentMode: true }, [{ id, name: "Marcelo" }], [{ id, name: "Trator Munck", plate: "" }]);
    mocks.extract.mockResolvedValueOnce({ ...emptyFuelEvidence, liters: 40, vehicle: "Trator Munck", meter: 100, meterKind: "km" });
    await processGroupFuel(db.client, { ...input, text: undefined, image: { imageUrl: "https://media.invalid/photo", caption: "Trator Munck" } });
    expect(db.current().evidence.truckFlow).toMatchObject({ equipmentId: id, meter: null });
    const bindings = JSON.parse(process.env.FUEL_GROUP_BINDINGS!); bindings[0].dryRun = false;
    vi.stubEnv("FUEL_GROUP_BINDINGS", JSON.stringify(bindings)); vi.stubEnv("FUEL_INTERNAL_ENABLED", "true");
    await processGroupFuel(db.client, { ...input, messageId: "live", text: { message: "Marcelo" } });
    expect(db.rpc.mock.calls.some(c => c[1].p_action === "confirm")).toBe(false);
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Nenhum lançamento realizado");
  });
  it("handles native buttonReply tokens through all five drivers and the final receipt", async () => {
    const drivers = Array.from({ length: 5 }, (_, i) => ({ id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}`, name: `Condutor ${i + 1}` }));
    const db = database(true, ready(), drivers), seen = new Set<string>();
    await processGroupFuel(db.client, input);
    for (let page = 0; page < 3; page++) {
      const options = mocks.buttons.mock.calls.at(-1)![2] as { id: string; label: string }[];
      options.filter(b => b.label !== "Mais opções").forEach(b => seen.add(b.label));
      const selected = page < 2 ? options.find(b => b.label === "Mais opções")! : options.find(b => b.label === "Condutor 5")!;
      await processGroupFuel(db.client, { ...input, text: undefined, messageId: `native-${page}`, buttonReply: { id: selected.id, displayText: selected.label } });
    }
    expect(seen.size).toBe(5);
    expect(db.rpc.mock.calls.filter(c => c[1].p_action === "confirm")).toHaveLength(1);
    expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_action: "confirm", p_dry_run: true, p_command: { driverId: drivers[4].id } });
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("✅ Motorista: Condutor 5\n\nSimulação concluída — nenhum lançamento realizado.");
  });
  it("rejects stale, nested, label-only and ambiguous native replies", async () => {
    const db = database(true, ready());
    for (const [i, buttonReply] of [
      { id: truckToken(id, 0, `driver:${id}`), displayText: "Condutor" },
      { quoted: { id: truckToken(id, 1, `driver:${id}`) } },
      { displayText: "Condutor" },
      { id: truckToken(id, 1, `driver:${id}`), other: truckToken(id, 1, "more") },
    ].entries()) {
      await processGroupFuel(db.client, { ...input, text: undefined, messageId: `bad-native-${i}`, buttonReply });
    }
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("accepts revision-bound list replies for pagination and driver selection", async () => {
    const db = database(true, ready(), [{ id, name: "Ana" }, { id: user, name: "Bia" }, { id: company, name: "Caio" }]);
    await processGroupFuel(db.client, { ...input, text: undefined, listResponseMessage: { selectedRowId: truckToken(id, 1, "more"), title: "Mais opções" } });
    expect(db.current().evidence.truckFlow.page).toBe(1);
    const selected = mocks.buttons.mock.calls.at(-1)![2][0];
    await processGroupFuel(db.client, { ...input, messageId: "select", text: undefined, listResponseMessage: { selectedRowId: selected.id, title: "Caio" } });
    expect(mocks.send.mock.calls.at(-1)![1]).toBe("[TESTE — não grava estoque/despesa]\n✅ Litragem: 162 litros\n✅ Odômetro: 16.755,9 km\n✅ Placa: ABC1D23\n✅ Motorista: Caio\n\nSimulação concluída — nenhum lançamento realizado.");
    expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_action: "confirm", p_dry_run: true });
  });
  it("limits options and typed identification to the group's selected company drivers", async () => {
    const bindings = JSON.parse(process.env.FUEL_GROUP_BINDINGS!);
    bindings[0].driverIds = [id, company]; // company UUID is deliberately absent from the driver query
    vi.stubEnv("FUEL_GROUP_BINDINGS", JSON.stringify(bindings));
    const db = database(true, ready(), [{ id, name: "Condutor" }, { id: user, name: "Outra função" }]);
    await processGroupFuel(db.client, input);
    expect(mocks.buttons.mock.calls.at(-1)![2]).toHaveLength(1);
    expect(mocks.buttons.mock.calls.at(-1)![2][0].label).toBe("Condutor");
    await processGroupFuel(db.client, { ...input, messageId: "excluded-name", text: { message: "Outra função" } });
    await processGroupFuel(db.client, { ...input, messageId: "excluded-button", text: undefined, buttonsResponseMessage: { buttonId: truckToken(id, db.current().revision, `driver:${user}`) } });
    expect(db.rpc.mock.calls.filter(c => c[1].p_action === "confirm")).toHaveLength(0);
    await processGroupFuel(db.client, { ...input, messageId: "allowed", text: { message: "Condutor" } });
    expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_action: "confirm", p_dry_run: true, p_command: { driverId: id } });
  });
  it("does not fall back to all drivers when an explicitly empty selection is configured", async () => {
    const bindings = JSON.parse(process.env.FUEL_GROUP_BINDINGS!); bindings[0].driverIds = [];
    vi.stubEnv("FUEL_GROUP_BINDINGS", JSON.stringify(bindings));
    const db = database(true, ready()); await processGroupFuel(db.client, input);
    expect(mocks.buttons).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Não há condutores");
  });
  it.each([5, 9])("reaches every one of %i drivers through More buttons, then finishes with the last driver", async count => {
    const drivers = Array.from({ length: count }, (_, i) => ({ id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}`, name: `Condutor ${i + 1}` }));
    const db = database(true, ready(), drivers), seen = new Set<string>();
    await processGroupFuel(db.client, input);
    for (let page = 0; page < Math.ceil(count / 2); page++) {
      const options = mocks.buttons.mock.calls.at(-1)![2] as { id: string; label: string }[];
      options.filter(b => b.label !== "Mais opções").forEach(b => seen.add(b.label));
      expect(db.current().evidence.truckFlow.page).toBe(page);
      const selected = page === Math.ceil(count / 2) - 1 ? options.find(b => b.label === drivers.at(-1)!.name)! : options.find(b => b.label === "Mais opções")!;
      await processGroupFuel(db.client, { ...input, messageId: `page-${page}`, text: undefined, buttonsResponseMessage: { buttonId: selected.id, message: selected.label } });
    }
    expect(seen.size).toBe(count);
    expect(db.rpc.mock.calls.filter(c => c[1].p_action === "confirm")).toHaveLength(1);
    expect(db.rpc.mock.calls.at(-1)![1]).toMatchObject({ p_dry_run: true, p_command: { driverId: drivers.at(-1)!.id } });
  });
  it("supports text and label-only navigation, wraps pages, and never bypasses a stale token", async () => {
    const db = database(true, ready(), [{ id, name: "Ana" }, { id: user, name: "Bia" }, { id: company, name: "Caio" }]);
    await processGroupFuel(db.client, { ...input, text: { message: "MAIS" } });
    expect(db.current().evidence.truckFlow.page).toBe(1);
    await processGroupFuel(db.client, { ...input, messageId: "label", text: undefined, buttonsResponseMessage: { message: "Mais opções" } });
    expect(db.current().evidence.truckFlow.page).toBe(0);
    const calls = db.rpc.mock.calls.length;
    await processGroupFuel(db.client, { ...input, messageId: "stale", text: undefined, buttonsResponseMessage: { buttonId: truckToken(id, 0, "more"), message: "Mais opções" } });
    expect(db.rpc).toHaveBeenCalledTimes(calls);
    expect(db.rpc.mock.calls.every(c => c[1].p_action !== "confirm")).toBe(true);
  });
  it("does nothing when disabled or for another group", async () => {
    const db = database(); expect(await processGroupFuel(db.client, { ...input, phone: "other" })).toBe(false);
    vi.stubEnv("FUEL_GROUP_ENABLED", "false"); expect(await processGroupFuel(db.client, input)).toBe(false); expect(db.from).not.toHaveBeenCalled();
  });
  it("silently consumes unauthorized senders and rejects inactive operators", async () => {
    const db = database(); await processGroupFuel(db.client, { ...input, participantPhone: "5542999999999" }); expect(db.from).not.toHaveBeenCalled();
    const inactive = database(false); await processGroupFuel(inactive.client, input); expect(inactive.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("accepts readable photos and asks the next field without Yes buttons, then identifies driver", async () => {
    const db = database(); let n = 0;
    for (const evidence of [{ ...emptyFuelEvidence, liters: 162 }, { ...emptyFuelEvidence, meter: 16755.9, meterKind: "km" }, { ...emptyFuelEvidence, vehicle: "ABC1D23" }]) {
      mocks.extract.mockResolvedValueOnce(evidence);
      await processGroupFuel(db.client, { ...input, messageId: `p${n++}`, text: undefined, image: { imageUrl: "https://media.invalid/photo" } });
      if (n < 3) { expect(mocks.buttons).not.toHaveBeenCalled(); expect(mocks.send.mock.calls.at(-1)![1]).toContain("✅"); }
    }
    const driver = mocks.buttons.mock.calls.at(-1)![2][0]; expect(driver.label).toBe("Condutor");
    await processGroupFuel(db.client, { ...input, messageId: "finish", text: undefined, buttonsResponseMessage: { buttonId: driver.id } });
    const confirms = db.rpc.mock.calls.filter(c => c[1].p_action === "confirm"); expect(confirms).toHaveLength(1);
    expect(confirms[0][1]).toMatchObject({ p_company: company, p_user: user, p_sender: input.participantPhone, p_dry_run: true, p_command: { liters: 162, meter: 16755.9, meterKind: "km", vehicleId: id, driverId: id } });
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Simulação concluída");
    expect(mocks.send.mock.calls.at(-1)![1]).not.toContain("R$");
    expect(db.filters).toContainEqual(["fuel_group_drafts", "sender", input.participantPhone]);
    expect(db.filters).toContainEqual(["drivers", "company_id", company]);
  });
  it("unreadable pump twice then typed 162 always replies with confirmed liters and asks odometer", async () => {
    const db = database();
    for (const messageId of ["photo1", "photo2"]) {
      mocks.extract.mockResolvedValueOnce(emptyFuelEvidence);
      await processGroupFuel(db.client, { ...input, messageId, text: undefined, image: { imageUrl: "https://media.invalid/a" } });
      expect(mocks.send.mock.calls.at(-1)![1]).toContain("digite a litragem");
      expect(mocks.send.mock.calls.at(-1)![1]).toContain("foto da bomba novamente");
      expect(db.current().evidence.truckFlow.confirmed.liters).toBe(false);
    }
    mocks.extract.mockClear();
    await processGroupFuel(db.client, { ...input, messageId: "fix", text: { message: "162" } });
    expect(mocks.extract).not.toHaveBeenCalled(); expect(mocks.buttons).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("162 litros");
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("odômetro");
    expect(mocks.send.mock.calls.at(-1)![1]).not.toContain("TRIP");
    expect(db.current().evidence.truckFlow.confirmed.liters).toBe(true);
  });
  it("accepts manual km and registered plate without AI and can identify by exact typed driver name", async () => {
    const db = database(true, { ...newTruckFlow(), liters: 162 });
    await processGroupFuel(db.client, { ...input, messageId: "km", text: { message: "16.755,9 km" } });
    expect(db.current().evidence.truckFlow.meter).toBe(16755.9);
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("foto da placa");
    await processGroupFuel(db.client, { ...input, messageId: "plate", text: { message: "ABC-1D23" } });
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("digite seu nome completo");
    await processGroupFuel(db.client, { ...input, messageId: "driver", text: { message: "Condutor" } });
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Simulação concluída");
  });
  it("unknown plates remain unconfirmed and never show a company vehicle list", async () => {
    const db = database(true, { ...ready(), plate: null, confirmed: { liters: true, meter: true, plate: false } });
    await processGroupFuel(db.client, { ...input, text: { message: "ZZZ9999" } });
    expect(db.current().evidence.truckFlow.confirmed.plate).toBe(false);
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("placa correta");
    expect(mocks.send.mock.calls.at(-1)![1]).not.toContain("ABC1D23");
  });
  it("rejects stale and foreign draft buttons without changing data", async () => {
    const db = database();
    for (const token of [truckToken(id, 0, "yes"), truckToken("other", 1, "yes")]) await processGroupFuel(db.client, { ...input, text: undefined, buttonsResponseMessage: { buttonId: token } });
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("cannot choose a driver before all three confirmations or from another company", async () => {
    for (const s of [newTruckFlow(), ready()]) {
      const db = database(true, s);
      await processGroupFuel(db.client, { ...input, text: undefined, buttonsResponseMessage: { buttonId: truckToken(id, 1, `driver:${user}`) } });
      expect(db.rpc).not.toHaveBeenCalled();
    }
  });
  it("does not duplicate a processed message or report success on database failure", async () => {
    const db = database(true, ready()), buttonId = truckToken(id, 1, `driver:${id}`);
    await processGroupFuel(db.client, { ...input, text: undefined, buttonsResponseMessage: { buttonId } });
    mocks.send.mockClear(); await processGroupFuel(db.client, { ...input, text: undefined, buttonsResponseMessage: { buttonId } }); expect(mocks.send).not.toHaveBeenCalled();
    const broken = database(true, ready()); broken.rpc.mockResolvedValueOnce({ data: null, error: new Error("db") });
    await processGroupFuel(broken.client, { ...input, text: undefined, buttonsResponseMessage: { buttonId } }); expect(mocks.send.mock.calls.at(-1)![1]).toContain("Não foi possível concluir");
  });
  it("keeps data on extraction failure and reports button sending failure", async () => {
    const db = database(); mocks.extract.mockRejectedValueOnce(new Error("unreadable"));
    await processGroupFuel(db.client, { ...input, text: undefined, image: { imageUrl: "https://media.invalid/a" } }); expect(db.rpc).not.toHaveBeenCalled();
    mocks.buttons.mockRejectedValueOnce(new Error("provider"));
    await processGroupFuel(database(true, ready()).client, input);
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Não consegui enviar os botões");
    expect(mocks.send.mock.calls.at(-1)![1]).toContain("Digite seu nome completo");
  });
});

