import { describe, expect, it } from "vitest";
import { emptyFuelEvidence } from "./fuelGroup";
import { fuelConversation, fuelLocalDate, selectedFuelDriver } from "./fuelConversation";
const vehicles = [{ id: "v1", name: "Caminhão", plate: "ABC1D23" }];
const drivers = [{ id: "d1", name: "Rogério" }];
const complete = { ...emptyFuelEvidence, vehicle: "ABC1D23", liters: 162, meter: 16755.9, meterKind: "km" as const, date: "2026-09-23" };
describe("guided fuel conversation", () => {
  it("keeps visible liters and requests only the next missing photo", () => {
    const message = fuelConversation({ ...emptyFuelEvidence, liters: 162 }, vehicles, drivers);
    expect(message).toContain("Litros: 162"); expect(message).toContain("foto do painel");
    expect(message).not.toContain("Rogério"); expect(message).not.toContain("Confirma?");
  });
  it("requests unreadable liters without losing a legible meter", () => {
    const message = fuelConversation({ ...complete, liters: null }, vehicles, drivers);
    expect(message).toContain("16.755,9"); expect(message).toContain("não consegui ler a litragem");
  });
  it("offers only company vehicles for an unknown plate", () => {
    const message = fuelConversation({ ...complete, vehicle: "ZZZ9999" }, vehicles, drivers);
    expect(message).toContain("ABC1D23"); expect(message).not.toContain("Rogério");
  });
  it("offers drivers only after the three readings are complete", () => {
    expect(fuelConversation(complete, vehicles, drivers)).toContain("MOTORISTA");
    expect(selectedFuelDriver("MOTORISTA Rogerio", complete, vehicles, drivers)?.id).toBe("d1");
    expect(selectedFuelDriver("Rogério", { ...complete, liters: null }, vehicles, drivers)).toBeNull();
    expect(selectedFuelDriver("Outro", complete, vehicles, drivers)).toBeNull();
    expect(selectedFuelDriver("Rogério", complete, vehicles, [...drivers, { id: "d2", name: "Rogério" }])).toBeNull();
  });
  it("uses Brazilian local date, not the UTC calendar day", () => {
    expect(fuelLocalDate(new Date("2026-09-24T01:30:00Z"))).toBe("2026-09-23");
  });
});
