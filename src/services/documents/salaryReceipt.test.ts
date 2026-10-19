import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateSalaryReceipt, receiptAmounts } from "./salaryReceipt";
import { calculateCost, type CostEntry, type CostRule } from "@/lib/frota/costs";
import { salaryExpenseLabel } from "@/lib/frota/salaryExpense";

const rule: CostRule = { name: "TRANSPORTE", person: "VITOR", category: "salario", driverId: null, vehicleId: null, method: "fixed", fixed: 3700, rate: 0, unit: "", basis: "realizado", startMonth: "2026-09", endMonth: null, dueDay: 6, dueMonthOffset: 1, allocations: [] };
export const sampleSalary: CostEntry = { id: "00000000-0000-4000-8000-000000000001", company_id: "company", rule_id: "rule", month: "2026-09", snapshot: { ...rule, base: 0, note: "", calculation: calculateCost(rule, "2026-09", 0), operationNames: {} }, amount: 3700, due_date: "2026-10-06", paid_on: "2026-10-06", expense_id: "expense", created_at: "2026-10-18" };
describe("recibo de salário", () => {
  it("exige despesa confirmada, salário e pagamento", () => {
    expect(() => receiptAmounts({ ...sampleSalary, paid_on: null })).toThrow();
    expect(() => receiptAmounts({ ...sampleSalary, expense_id: null })).toThrow();
    expect(() => receiptAmounts({ ...sampleSalary, snapshot: { ...sampleSalary.snapshot, category: "outro" } })).toThrow();
  });
  it("separa total, vales e saldo efetivamente quitado sem duplicação", () => {
    const entry = { ...sampleSalary, snapshot: { ...sampleSalary.snapshot, advances: [{ id: "a", amount: 500, date: "2026-09-15", note: "", recordedAt: "", recordedBy: "" }] } };
    expect(receiptAmounts(entry)).toEqual({ total: 3700, advances: 500, settlement: 3200 });
    expect(entry.amount).toBe(3700);
  });
  it("gera um PDF A5 com nomes longos e caracteres especiais", async () => {
    const bytes = await generateSalaryReceipt({ company: { name: "EMPRESA ".repeat(15) }, employee: { name: "PROENÇA ".repeat(15) + "🚚", phone: null }, entry: sampleSalary });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(419.53);
  });
  it("vencimento dia 6 do mês seguinte e virada de ano", () => {
    expect(calculateCost(rule, "2026-10", 0).dueDate).toBe("2026-11-06");
    expect(calculateCost(rule, "2026-12", 0).dueDate).toBe("2027-01-06");
  });
  it("rotula somente despesas com vínculo real de salário", () => {
    expect(salaryExpenseLabel("e1", [{id:"c1",expense_id:"e1",paid_on:null,month:"2026-09"}])).toBe("Salário");
    expect(salaryExpenseLabel("fuel", [{id:"c1",expense_id:"e1",paid_on:null,month:"2026-09"}])).toBeNull();
  });
});
