import { describe, expect, it } from "vitest";
import { monthlyFuelConsolidates, summarizeMonthlyExpenses, type ExpenseSource } from "./monthlyExpenses";
import type { MonthlyProduction } from "./productionGoals";
const expense = (id: string, amount: number, overrides: Partial<ExpenseSource> = {}): ExpenseSource => ({ id, amount, vehicle_id: "truck", expense_type: "outro", description: null, fuel_fillup_id: null, ...overrides });
const production = [{ vehicle_id: "truck", diesel_liters: 555, actual_tonnes: 336.76, operation: "transporte" }] as MonthlyProduction[];
describe("monthly expenses", () => {
  it("includes September salary once, independently of its October payment", () => {
    const fuel = [4079.25,14516.25,10304.70,5835.90,4762.80,1183.35,1264.20].map((n,i) => expense(`f${i}`,n,{expense_type:"combustivel",vehicle_id:`v${i}`}));
    const payroll = [3000,5500,3700,3500,3500,2000,2000].map((n,i) => expense(`p${i}`,n,{vehicle_id:`v${i}`}));
    const links = payroll.map(e => ({ expense_id: e.id, snapshot: { category: "salario" } }));
    const result = summarizeMonthlyExpenses([...fuel,...payroll,payroll[0]], [...links,links[0]]);
    expect(result).toMatchObject({ fuel:41946.45,payroll:23200,other:0,total:65146.45,count:14 });
    expect((7386680 - Math.round(result.total*100))/100).toBe(8720.35);
    expect(result.byVehicle.v0.total).toBe(7079.25);
  });
  it("classifies insurance as other and ignores unconfirmed payroll", () => {
    expect(summarizeMonthlyExpenses([expense("a",20),expense("b",30)], [
      {expense_id:"a",snapshot:{category:"seguro"}}, {expense_id:"b",snapshot:{category:"pro_labore"}}, {expense_id:null,snapshot:{category:"salario"}},
    ])).toMatchObject({other:20,payroll:30,total:50});
  });
  it("does not deduplicate different records by amount or vehicle", () => {
    expect(summarizeMonthlyExpenses([expense("a",0.1),expense("b",0.2)],[]).total).toBe(0.3);
  });
  it("matches only the explicit monthly fuel import, not arbitrary fillups", () => {
    const fuel = expense("a",4079.25,{expense_type:"combustivel",description:"[CONSOLIDADO MENSAL 2026-09] fechamento"});
    const result = monthlyFuelConsolidates("2026-09",production,[fuel,fuel]);
    expect(result[0]).toMatchObject({liters:555,amount:4079.25,expenseIds:["a"],needsReview:false});
    expect(monthlyFuelConsolidates("2026-10",production,[fuel])[0].amount).toBeNull();
  });
  it("warns when consolidated and detailed fuel coexist instead of summing them", () => {
    const items = [expense("a",100,{expense_type:"combustivel",description:"[CONSOLIDADO MENSAL 2026-09 - CARREGAMENTO]"}),expense("b",20,{expense_type:"combustivel",fuel_fillup_id:"f1"})];
    expect(monthlyFuelConsolidates("2026-09",production,items)[0]).toMatchObject({amount:100,needsReview:true});
  });
  it("never presents unlinked monthly liters as a zero financial expense", () => {
    expect(monthlyFuelConsolidates("2026-09",production,[])[0].amount).toBeNull();
    expect(monthlyFuelConsolidates("2026-09",[{...production[0],diesel_liters:null}],[])).toEqual([]);
  });
});
