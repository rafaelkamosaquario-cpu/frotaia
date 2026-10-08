import { describe,it,expect } from "vitest";
import { monthlyMonitoringBrief,monthlyMonitoringEnabled,monthlyMonitoringMessages,type MonthlySnapshot } from "./monthlyMonitoring";
import { pendingMonthlyPayroll } from "./monthlyExpenses";
const base:MonthlySnapshot={month:"2026-09",today:"2026-10-05",rows:[],revenueSummary:{total:100,transport:100,loading:0,other:0,count:1,byVehicle:{truck:{amount:100,count:1}}},expenseSummary:{total:120,fuel:80,payroll:40,other:0,count:2,byVehicle:{truck:{total:120,fuel:80,payroll:40,other:0}}}};
describe("company monthly monitoring",()=>{
  it("keeps the visible summary brief without declaring profit or non-payment",()=>{
    const messages=monthlyMonitoringBrief({...base,payrollDue:[{date:"2026-10-06",amount:23200}]});
    expect(messages).toHaveLength(2);
    expect(messages.join(" ")).toContain("Não é lucro líquido");
    expect(messages.join(" ")).toContain("sem baixa integral");
    expect(messages.every(m=>m.length<140)).toBe(true);
    expect(monthlyMonitoringBrief({...base,expenseSummary:null})[0]).toContain("indisponível");
  });
  it("enables only the requested pilot",()=>{expect(monthlyMonitoringEnabled("0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac")).toBe(true);expect(monthlyMonitoringEnabled("another-company")).toBe(false);});
  it("uses recorded money and warns without blaming the driver",()=>{const text=monthlyMonitoringMessages(base,{truck:"ABC1234"}).join(" ");expect(text).toContain("ABC1234");expect(text).toContain("20,00");expect(text).toContain("não indica culpa");});
  it("never declares a result when either financial query failed",()=>{const text=monthlyMonitoringMessages({...base,expenseSummary:null},{}).join(" ");expect(text).toContain("indisponível");expect(text).not.toContain("Saldo parcial:");});
  it("does not mistake missing production for zero",()=>{const text=monthlyMonitoringMessages({...base,rows:[{company_id:"a",vehicle_id:"truck",month:"2026-10",operation:"transporte",actual_tonnes:null,target_tonnes:850,diesel_liters:null,measured_through:null,note:"",revision:1,updated_at:""}]},{}).join(" ");expect(text).toContain("sem apuração");expect(text).not.toContain("abaixo da meta");});
  it("includes recorded payroll due date without claiming non-payment",()=>{const text=monthlyMonitoringMessages({...base,payrollDue:[{date:"2026-10-06",amount:23200}]},{}).join(" ");expect(text).toContain("06/10/2026");expect(text).toContain("não comprova falta de pagamento");});
  it("subtracts advances and excludes paid, unconfirmed and duplicate commitments",()=>{
    const cost={expense_id:"e1",amount:100,due_date:"2026-10-06",paid_on:null,snapshot:{category:"salario",advances:[{amount:25}]}};
    expect(pendingMonthlyPayroll([cost,cost,{...cost,expense_id:"e2",paid_on:"2026-10-04"},{...cost,expense_id:null}])).toEqual([{date:"2026-10-06",amount:75}]);
  });
});
