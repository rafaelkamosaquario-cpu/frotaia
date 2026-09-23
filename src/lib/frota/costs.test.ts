import { describe, expect, it } from "vitest";
import { calculateCost, costRuleSchema, type CostRule } from "./costs";
const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
const rule = (overrides: Partial<CostRule> = {}) => costRuleSchema.parse({ name: "Salário teste", category: "salario", person: "Pessoa de teste", method: "fixed", fixed: 5500, startMonth: "2026-09", dueDay: 31, ...overrides });
describe("costs and remuneration", () => {
 it("keeps September competence with payment on October 5", () => {
  const input = rule({ dueDay: 5, dueMonthOffset: 1, endMonth: "2026-09" });
  expect(calculateCost(input, "2026-09", 0)).toMatchObject({ amount:5500, dueDate:"2026-10-05" });
  expect(input.startMonth).toBe("2026-09");
 });
 it.each([["2026-12","2027-01-31"],["2027-01","2027-02-28"],["2028-01","2028-02-29"]])("handles next month from %s", (month, expected) => {
  expect(calculateCost(rule({ dueMonthOffset:1 }),month,0).dueDate).toBe(expected);
 });
 it("preserves legacy same-month rules and rejects invalid offsets", () => {
  expect(calculateCost(rule({ dueDay:5 }),"2026-09",0).dueDate).toBe("2026-09-05");
  for (const dueMonthOffset of [-1,2,0.5]) expect(() => rule({ dueMonthOffset })).toThrow();
 });
 it("fixed salary is charged once and split, not multiplied", () => {
  const result = calculateCost(rule({ allocations: [{ operationId: ids[0], percent: 60 }, { operationId: ids[1], percent: 40 }] }), "2026-09", 90000);
  expect(result.amount).toBe(5500); expect(result.variable).toBe(0);
  expect(result.allocations.map(a => a.amount)).toEqual([3300,2200]); expect(result.dueDate).toBe("2026-09-30");
 });
 it.each([["percent",0,10,18045.14,1804.51],["fixed_percent",3700,10,18045.14,5504.51],["unit",0,10,2140,21400],["fixed_unit",3000,2,148.38,3296.76]] as const)("calculates %s", (method,fixed,rate,base,expected) => {
  expect(calculateCost(rule({ method, fixed, rate, unit: "tonelada" }), "2026-09", base).amount).toBe(expected);
 });
 it("conserves cents with three-way allocations", () => {
  const result = calculateCost(rule({ fixed: 0.05, allocations: ids.map((id,i) => ({ operationId:id, percent:i === 2 ? 33.34 : 33.33 })) }), "2026-09", 0);
  expect(result.allocations.reduce((s,a) => s+Math.round(a.amount*100),0)).toBe(5);
 });
 it("supports leap February and does not mutate rule", () => {
  const input = rule(); const before = JSON.stringify(input);
  expect(calculateCost(input,"2028-02",0).dueDate).toBe("2028-02-29"); expect(JSON.stringify(input)).toBe(before);
 });
 it.each([{ fixed:-1 }, { fixed:1.001 }, { allocations:[{ operationId:ids[0],percent:50 }] }, { allocations:[{ operationId:ids[0],percent:50 },{ operationId:ids[0],percent:50 }] }, { method:"percent",rate:101 }, { method:"unit",rate:10,unit:"" }, { person:"" }, { endMonth:"2026-08" }])("rejects invalid rule %j", overrides => {
  expect(() => rule(overrides as Partial<CostRule>)).toThrow();
 });
 it("rejects out of term month and invalid base", () => {
  expect(() => calculateCost(rule(),"2026-08",0)).toThrow();
  expect(() => calculateCost(rule({ endMonth:"2026-10" }),"2026-11",0)).toThrow();
  for (const base of [-1,NaN,Infinity,100000001]) expect(() => calculateCost(rule(),"2026-09",base)).toThrow();
 });
});
