import { describe, expect, it } from "vitest";
import { emptyFuelEvidence, fuelEvidenceSchema, resolveFuelChoice, reviewFuelEvidence } from "./fuelGroup";
const vehicles = [{ id: "v1", plate: "ABC1D23", name: "Caminhão" }, { id: "v2", plate: null, name: "Trator guincho" }];
const drivers = [{ id: "d1", name: "Rogério" }];
describe("group fuel confirmation", () => {
  it("requests missing plate and driver when photos only give liters/km", () => {
    const r = reviewFuelEvidence({ ...emptyFuelEvidence, liters: 162, meter: 16777, meterKind: "km" }, vehicles, drivers, "token");
    expect(r.ready).toBe(false); expect(r.message).toContain("ABC1D23"); expect(r.message).toContain("Rogério"); expect(r.message).toContain("Data");
  });
  it("matches normalized plate and accents but not arbitrary ids", () => {
    expect(resolveFuelChoice("abc-1d23", vehicles)?.id).toBe("v1");
    expect(resolveFuelChoice("Rogerio", drivers)?.id).toBe("d1");
    expect(resolveFuelChoice("v1", vehicles)).toBeNull();
  });
  it("never guesses between duplicate names", () => expect(resolveFuelChoice("Rogério", [...drivers, { id: "d2", name: "Rogério" }])).toBeNull());
  it("only offers supplied company choices", () => expect(reviewFuelEvidence(emptyFuelEvidence, [], [], "t").message).not.toContain("ABC1D23"));
  it("requires explicit token and reveals no cost", () => {
    const r = reviewFuelEvidence({ vehicle: "ABC1D23", driver: "Rogério", date: "2026-09-21", meter: 16777, meterKind: "km", liters: 162 }, vehicles, drivers, "123-4");
    expect(r.ready).toBe(true); expect(r.message).toContain("CONFIRMAR 123-4"); expect(r.message).not.toContain("R$");
  });
  it("rejects a model returning price or extra instructions", () => expect(fuelEvidenceSchema.safeParse({ ...emptyFuelEvidence, price: 7.12 }).success).toBe(false));
  it("supports equipment and hours", () => expect(reviewFuelEvidence({ vehicle: "Trator guincho", driver: "Rogerio", date: "2026-09-21", meter: 400, meterKind: "hours", liters: 50 }, vehicles, drivers, "t").ready).toBe(true));
});
