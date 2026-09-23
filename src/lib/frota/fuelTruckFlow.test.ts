import { describe, expect, it } from "vitest";
import { emptyFuelEvidence } from "./fuelGroup";
import { applyTruckEvidence, confirmTruckField, newTruckFlow, truckAction, truckField, truckFlowSchema, truckPrompt, truckToken } from "./fuelTruckFlow";
const vehicles = [{ id: "v1", name: "Caminhão", plate: "ABC1D23" }];
const drivers = [{ id: "d1", name: "Rogério" }, { id: "d2", name: "Marcelo" }, { id: "d3", name: "Vitor" }];
describe("truck buttons", () => {
  it("requires three individual confirmations", () => {
    let s = applyTruckEvidence(newTruckFlow(), { ...emptyFuelEvidence, liters: 162, meter: 16755.9, meterKind: "km", vehicle: "abc-1d23" });
    for (const field of ["liters", "meter", "plate"]) {
      expect(truckField(s)).toBe(field);
      expect(truckPrompt(s, vehicles, drivers, "draft", 1).buttons.map(b => b.label)).toEqual(["Sim", "Não"]);
      s = confirmTruckField(s, true);
    }
    expect(truckField(s)).toBeNull();
    const prompt = truckPrompt(s, vehicles, drivers, "draft", 4);
    expect(prompt.message).toContain("Identifique-se"); expect(prompt.message).not.toContain("Rogério");
    expect(prompt.buttons.map(b => b.label)).toEqual(["Rogério", "Marcelo", "Mais opções"]);
    s.page = 1;
    expect(truckPrompt(s, vehicles, drivers, "draft", 5).buttons.map(b => b.label)).toEqual(["Vitor", "Mais opções"]);
  });
  it("No discards only the rejected value and corrections still require Yes", () => {
    const s = applyTruckEvidence(newTruckFlow(), { ...emptyFuelEvidence, liters: 100, meter: 1000, meterKind: "km" });
    const rejected = confirmTruckField(s, false);
    expect(rejected.liters).toBeNull(); expect(rejected.meter).toBe(1000);
    const corrected = applyTruckEvidence(rejected, { ...emptyFuelEvidence, liters: 162 });
    expect(corrected.confirmed.liters).toBe(false);
  });
  it("never overwrites a confirmed reading with a later photo", () => {
    const s = confirmTruckField(applyTruckEvidence(newTruckFlow(), { ...emptyFuelEvidence, liters: 162 }), true);
    expect(applyTruckEvidence(s, { ...emptyFuelEvidence, liters: 200 }).liters).toBe(162);
  });
  it("does not guess missing evidence, accept hours, or expose vehicle options", () => {
    const s = applyTruckEvidence(newTruckFlow(), { ...emptyFuelEvidence, meter: 200, meterKind: "hours" });
    expect(s.meter).toBeNull(); expect(truckPrompt(s, vehicles, drivers, "a", 1).buttons).toEqual([]);
    s.confirmed.liters = true; s.confirmed.meter = true; s.plate = "ZZZ9999";
    const p = truckPrompt(s, vehicles, drivers, "a", 1);
    expect(p.buttons).toEqual([]); expect(p.message).not.toContain("ABC1D23");
  });
  it("binds every button to draft and revision", () => {
    const token = truckToken("draft-a", 2, "yes");
    expect(truckAction(token, "draft-b", 2)).toBeNull();
    expect(truckAction(token, "draft-a", 3)).toBeNull();
    expect(truckAction(token, "draft-a", 2)).toBe("yes");
  });
  it("can read JSON after postgres strips null object fields", () => {
    const s = newTruckFlow(); const stripped = Object.fromEntries(Object.entries(s).filter(([, value]) => value !== null));
    expect(truckFlowSchema.parse(stripped)).toEqual(s);
  });
});

