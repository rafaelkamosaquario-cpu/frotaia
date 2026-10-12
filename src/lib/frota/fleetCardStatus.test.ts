import { describe, expect, it } from "vitest";
import { fleetCardStatus } from "./fleetCardStatus";
import type { MonthlyProduction } from "./productionGoals";
const row: MonthlyProduction = { company_id: "test", vehicle_id: "vehicle", month: "2026-09", operation: "transporte", target_tonnes: 850, actual_tonnes: 336.76, diesel_liters: 555, measured_through: "2026-09-30", note: "", revision: 1, updated_at: "2026-10-01" };
describe("fleet card production status", () => {
  it("marks a fully reported past period below target", () => expect(fleetCardStatus(row, "2026-10-12").label).toBe("Abaixo da meta"));
  it("does not condemn an ongoing month or infer working-day pace", () => expect(fleetCardStatus({ ...row, month: "2026-10", measured_through: "2026-10-12" }, "2026-10-12").label).toBe("Apuração parcial"));
  it("does not close an incomplete past period", () => expect(fleetCardStatus({ ...row, measured_through: "2026-09-15" }, "2026-10-12").label).toBe("Apuração parcial"));
  it("distinguishes missing production from confirmed zero", () => {
    expect(fleetCardStatus(undefined, "2026-10-12").label).toBe("Sem apuração");
    expect(fleetCardStatus({ ...row, actual_tonnes: null }, "2026-10-12").label).toBe("Sem apuração");
    expect(fleetCardStatus({ ...row, actual_tonnes: 0 }, "2026-10-12").label).toBe("Abaixo da meta");
  });
  it("reports achieved targets, absent targets and inactive vehicles", () => {
    expect(fleetCardStatus({ ...row, actual_tonnes: 900 }, "2026-10-12").label).toBe("Meta atingida");
    expect(fleetCardStatus({ ...row, target_tonnes: null }, "2026-10-12").label).toBe("Sem meta");
    expect(fleetCardStatus(row, "2026-10-12", false).label).toBe("Inativo");
  });
  it("does not present a future period as achieved", () => expect(fleetCardStatus({ ...row, month: "2026-11", actual_tonnes: 900 }, "2026-10-12").label).toBe("Mês futuro"));
});
