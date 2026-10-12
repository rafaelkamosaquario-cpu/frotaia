import { describe, it, expect } from "vitest";
import { alertText, operationalReport, reportText } from "./communication";
import type { MonthlySnapshot } from "./monthlyMonitoring";
import type { MonthlyProduction } from "./productionGoals";
const row: MonthlyProduction = { company_id: "company", vehicle_id: "truck", month: "2026-09", operation: "transporte", actual_tonnes: 336.760, target_tonnes: 850, diesel_liters: 555, measured_through: "2026-09-30", note: "", revision: 1, updated_at: "" };
const data: MonthlySnapshot = { month: "2026-09", today: "2026-10-12", rows: [row], revenueSummary: { total: 100, transport: 100, loading: 0, other: 0, count: 1, byVehicle: { truck: { amount: 100, count: 1 } } }, expenseSummary: { total: 120, fuel: 80, payroll: 40, other: 0, count: 2, byVehicle: { truck: { total: 120, fuel: 80, payroll: 40, other: 0 } } } };
const vehicle = { id: "truck", label: "MDJ7550 · Ford Cargo" };
describe("common Frota IA communication", () => {
  it("identifies company, vehicle and period with the exact recorded values", () => {
    const text = reportText(operationalReport(data, "TR João e Miguel", vehicle));
    for (const value of ["Frota IA informa", "TR João e Miguel", "MDJ7550", "09/2026", "336,76 t", "850 t", "555 L", "Abaixo da meta", "30/09/2026", "20,00", "Não é lucro líquido"]) expect(text).toContain(value);
    expect(text).not.toContain("|");
  });
  it("does not substitute failed queries or missing production with zero", () => {
    const report = operationalReport({ ...data, revenueSummary: null, rows: [] }, "Company", vehicle);
    expect(report.fields.find(f => f.label === "Saldo parcial")?.value).toBe("Indisponível");
    expect(report.fields.find(f => f.label === "Produção")?.value).toBe("Não informada");
    const zero = operationalReport({ ...data, rows: [{ ...row, actual_tonnes: 0 }] }, "Company", vehicle);
    expect(zero.fields[0].value).toBe("0 t");
  });
  it("does not mix transportation and loading tonnes", () => {
    const report = operationalReport({ ...data, rows: [row, { ...row, vehicle_id: "tractor", operation: "carregamento", actual_tonnes: 554.9 }] }, "Company");
    expect(report.fields[0]).toEqual({ label: "Transporte", value: "336,76 t registradas" });
    expect(report.fields[1]).toEqual({ label: "Carregamento", value: "554,9 t registradas" });
  });
  it("uses the same partial and inactive status as the vehicle cards", () => {
    const partial = operationalReport({ ...data, rows: [{ ...row, measured_through: "2026-09-10" }] }, "Company", vehicle);
    expect(partial.fields[2].value).toBe("Apuração parcial");
    expect(operationalReport(data, "Company", { ...vehicle, active: false }).fields[2].value).toBe("Inativo");
  });
  it("keeps important alert notes and distinguishes scheduling from the due date", () => {
    const text = alertText({ title: "Frota IA informa — Custos e remunerações", company: "Company", vehicle: "ABC1234", scheduledFor: "2026-10-05T12:00:00Z", notes: "Referência: 09/2026. Vencimento: 06/10/2026. Valor: R$ 1.250,00." });
    expect(text.match(/Frota IA informa/g)).toHaveLength(1);
    for (const value of ["ABC1234", "05/10/2026", "09:00", "06/10/2026", "1.250,00"]) expect(text).toContain(value);
    expect(alertText({ title: "Revisão" })).toBe("Frota IA informa\nRevisão");
  });
});
