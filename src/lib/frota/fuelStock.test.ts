import { describe, expect, it } from "vitest";
import { calculateFuelStock, fuelStockCommand } from "./fuelStock";
const empty = { liters: 0, value: 0, average: 0 };
describe("internal diesel stock", () => {
  it("starts with zero, never assumes historical stock", () => {
    expect(() => calculateFuelStock(empty, 162)).toThrow("Estoque insuficiente");
  });
  it("uses weighted average, not simple average", () => {
    const a = calculateFuelStock(empty, 1000, 7000);
    const b = calculateFuelStock(a, 500, 4000);
    expect(b.liters).toBe(1500); expect(b.value).toBe(11000); expect(b.average).toBeCloseTo(7.333333);
  });
  it("prices the confirmed example and reduces balance once", () => {
    const stock = calculateFuelStock(empty, 1000, 7120);
    const next = calculateFuelStock(stock, 162);
    expect(next.cost).toBe(1153.44); expect(next.liters).toBe(838); expect(next.value).toBe(5966.56);
  });
  it("uses remaining value on last withdrawal to avoid stranded cents", () => {
    const stock = calculateFuelStock(empty, 3, 10);
    const first = calculateFuelStock(stock, 1);
    const last = calculateFuelStock(first, 2);
    expect(first.cost + last.cost).toBe(10); expect(last.value).toBe(0); expect(last.average).toBe(0);
  });
  it("does not reprice a prior withdrawal on a new purchase", () => {
    const withdrawal = calculateFuelStock(calculateFuelStock(empty, 100, 700), 20);
    calculateFuelStock(withdrawal, 100, 900);
    expect(withdrawal.cost).toBe(140);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid quantity %s", qty => {
    expect(() => calculateFuelStock(empty, qty, 100)).toThrow();
  });
  it("rejects negative inventory", () => expect(() => calculateFuelStock({ liters: 10, value: 70, average: 7 }, 11)).toThrow());
  const withdrawal = { requestId: "d0f9c633-b18b-4550-8e63-b19e16b8fe8c", kind: "withdrawal", date: "2026-09-22", liters: 162, vehicleId: "e37e9896-c0e0-4411-ac31-158683b604a3", driverId: "ba23889a-b7f9-45b5-85c3-d2f195585cf6", meterKind: "km", meter: 16777 };
  it("requires vehicle, driver and meter", () => {
    expect(fuelStockCommand.safeParse(withdrawal).success).toBe(true);
    for (const key of ["vehicleId", "driverId", "meter", "date"]) expect(fuelStockCommand.safeParse({ ...withdrawal, [key]: undefined }).success).toBe(false);
  });
  it("never accepts client supplied cost for withdrawal", () => expect(fuelStockCommand.safeParse({ ...withdrawal, total: 1 }).success).toBe(false));
  it("supports tractor hour meter", () => expect(fuelStockCommand.safeParse({ ...withdrawal, meterKind: "hours", meter: 1200.5 }).success).toBe(true));
  it("rejects excess precision", () => expect(fuelStockCommand.safeParse({ ...withdrawal, liters: 1.0001 }).success).toBe(false));
});
