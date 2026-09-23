import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ create: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/anthropic/client", () => ({ CLAUDE_MODEL: "test", createAnthropicClient: () => ({ messages: { create: mocks.create } }) }));
vi.mock("@/lib/whatsapp/mediaDownloader", () => ({ baixarMidia: mocks.download, paraBase64: () => "test" }));
import { extractFuelEvidence } from "./fuelImageExtraction";
import { emptyFuelEvidence } from "@/lib/frota/fuelGroup";
beforeEach(() => vi.clearAllMocks());
describe("fuel extraction", () => {
  it("accepts explicit liters without an AI call", async () => {
    expect(await extractFuelEvidence("162 litros")).toEqual({ ...emptyFuelEvidence, liters: 162 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("accepts decimal comma and rejects zero", async () => {
    expect((await extractFuelEvidence("162,5 L")).liters).toBe(162.5);
    await expect(extractFuelEvidence("0 litros")).rejects.toThrow();
  });
  it("accepts a JSON code fence but still validates evidence", async () => {
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: "```json\n" + JSON.stringify({ ...emptyFuelEvidence, meter: 16755.9, meterKind: "km" }) + "\n```" }] });
    expect((await extractFuelEvidence("km do painel")).meter).toBe(16755.9);
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: '{"liters":162}' }] });
    await expect(extractFuelEvidence("dados")).rejects.toThrow();
  });
  it("does not guess a value from unrelated text", async () => {
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(emptyFuelEvidence) }] });
    expect(await extractFuelEvidence("talvez 162 ou 170 litros")).toEqual(emptyFuelEvidence);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
