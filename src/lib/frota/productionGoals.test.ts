import { describe, expect, it } from "vitest";
import { brazilToday, goalProgress, productionSchema } from "./productionGoals";
const row = { month: "2026-09", target_tonnes: 850, actual_tonnes: 336.760, measured_through: "2026-09-30" };
describe("monthly production goals", () => {
  it("shows closed month below goal and exact gap", () => { const result = goalProgress(row, "2026-10-05"); expect(result.label).toBe("Abaixo da meta"); expect(result.missing).toBeCloseTo(513.240); });
  it("does not confuse missing data with zero", () => { expect(goalProgress({ ...row, actual_tonnes: null }, "2026-10-05").tone).toBe("neutral"); expect(goalProgress({ ...row, actual_tonnes: 0 }, "2026-10-05").tone).toBe("danger"); });
  it("recognizes met and exceeded goals without negative gaps", () => { for (const actual_tonnes of [850, 900]) { const p = goalProgress({ ...row, actual_tonnes }, "2026-10-05"); expect(p.label).toBe("Meta atingida"); expect(p.missing).toBe(0); } });
  it("does not flag future months as failure", () => { expect(goalProgress(row, "2026-08-01").label).toBe("Mês futuro"); });
  it("uses measurement date for partial pace, not today's date", () => { expect(goalProgress({ ...row, actual_tonnes: 300, measured_through: "2026-09-10" }, "2026-10-05").label).toBe("No ritmo da meta"); });
  it("does not apply truck goals to unconfigured loaders", () => { expect(goalProgress({ ...row, target_tonnes: null }, "2026-10-05").label).toBe("Sem meta"); });
  it("handles leap February", () => { expect(goalProgress({ ...row, month: "2028-02", measured_through: "2028-02-29" }, "2028-03-01").closed).toBe(true); });
  it("uses Sao Paulo date across UTC midnight", () => { expect(brazilToday(new Date("2026-10-05T01:00:00Z"))).toBe("2026-10-04"); });
  it("checks fleet totals separately from loader tonnes", () => { const actual = [336.760,535.460,497.860,429.080,114.800].reduce((a,b)=>a+b,0); expect(actual).toBeCloseTo(1913.960); expect(actual/(5*850)*100).toBeCloseTo(45.03435); });
});
const input = { ...row, vehicle_id: "3618fed2-66ec-424d-a3d5-54ac05684c64", operation: "transporte", diesel_liters: 555, note: "Totais informados", revision: null };
describe("production input", () => {
  it("accepts exact three decimal quantities", () => expect(productionSchema.safeParse(input).success).toBe(true));
  it.each([{ month: "2026-13" }, { measured_through: "2026-08-30" }, { measured_through: null }, { actual_tonnes: -1 }, { actual_tonnes: 0.0001 }, { target_tonnes: 0 }, { company_id: "other" }, { amount: 100 }, { revision: 0 }])("rejects invalid input %j", patch => expect(productionSchema.safeParse({ ...input, ...patch }).success).toBe(false));
  it("allows explicit unreported production", () => expect(productionSchema.safeParse({ ...input, actual_tonnes: null, measured_through: null }).success).toBe(true));
});
