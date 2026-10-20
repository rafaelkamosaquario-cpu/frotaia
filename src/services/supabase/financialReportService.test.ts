import { beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({expenses:vi.fn(),revenues:vi.fn(),vehicles:vi.fn(),drivers:vi.fn()}));
vi.mock("./expenseService",()=>({listExpenses:m.expenses}));
vi.mock("./revenueService",()=>({listRevenues:m.revenues}));
vi.mock("./vehicleService",()=>({listVehiclesForPanel:m.vehicles}));
vi.mock("./driverService",()=>({listDriversForPanel:m.drivers}));
import {loadFinancialReport} from "./financialReportService";
import type {SupabaseDbClient} from "./types";
const company={id:"company-a",name:"A"}, filter={from:"2026-09-01",to:"2026-09-30"};
function productionDb(data:unknown[]=[],error:unknown=null) {
 const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data,error})};
 for(const fn of [q.select,q.eq,q.order])fn.mockReturnValue(q);
 return {db:{from:vi.fn().mockReturnValue(q)} as unknown as SupabaseDbClient,q};
}
beforeEach(()=>{vi.clearAllMocks();m.expenses.mockResolvedValue([]);m.revenues.mockResolvedValue([]);m.vehicles.mockResolvedValue([]);m.drivers.mockResolvedValue([]);});
it("escopa leituras e divide vínculos em lotes, sem somar salário duas vezes",async()=>{
 m.expenses.mockResolvedValue(Array.from({length:101},(_,i)=>({id:`e${i}`,amount:100,expense_date:"2026-09-01",expense_type:"outro",vehicle_id:null,settlement_status:"settled",settled_on:"2026-10-06"})));
 const q={select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),range:vi.fn()};
 for(const fn of [q.select,q.eq,q.in,q.order])fn.mockReturnValue(q);
 q.range.mockResolvedValueOnce({data:[{expense_id:"e0",month:"2026-09",due_date:"2026-10-06",snapshot:{category:"salario",person:"GORDO",name:"Transporte"}}],error:null}).mockResolvedValueOnce({data:[],error:null});
 const db={from:vi.fn().mockReturnValue(q)} as unknown as SupabaseDbClient;
 const r=await loadFinancialReport(productionDb().db,db,company,filter);
 expect(r.expenses).toHaveLength(101);expect(r.expenses[0].category).toBe("Salário");expect(r.expenses[0].person).toBe("GORDO");
 expect(q.eq).toHaveBeenCalledWith("company_id","company-a");expect(q.in.mock.calls.map(c=>c[1].length)).toEqual([100,1]);
 expect(m.expenses).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({companyId:"company-a",dateFrom:"2026-09-01",dateTo:"2026-09-30",all:true}));
});
it("não admite veículo de outra empresa",async()=>{const db={} as SupabaseDbClient;await expect(loadFinancialReport(db,db,company,{...filter,vehicleId:"foreign"})).rejects.toThrow("Veículo fora");});
it("não consulta folha sem despesas e mantém conjunto vazio",async()=>{const db={from:vi.fn()} as unknown as SupabaseDbClient;const r=await loadFinancialReport(productionDb().db,db,company,filter);expect(r.expenses).toEqual([]);expect(db.from).not.toHaveBeenCalled();});
it("lê metas com empresa, mês e veículo da sessão",async()=>{
 m.vehicles.mockResolvedValue([{id:"v"}]);
 const {db,q}=productionDb([{vehicle_id:"v",target_tonnes:600}]);
 const r=await loadFinancialReport(db,db,company,{...filter,vehicleId:"v"});
 expect(q.eq).toHaveBeenCalledWith("company_id","company-a");
 expect(q.eq).toHaveBeenCalledWith("month","2026-09");
 expect(q.eq).toHaveBeenCalledWith("vehicle_id","v");
 expect(r.production?.[0].target_tonnes).toBe(600);
});
it("falha sem PDF parcial quando metas não podem ser lidas",async()=>{
 const {db}=productionDb([],new Error("unavailable"));
 await expect(loadFinancialReport(db,db,company,filter)).rejects.toThrow("unavailable");
});
it("não mistura totais mensais com recorte parcial",async()=>{
 const db={from:vi.fn()} as unknown as SupabaseDbClient;
 const r=await loadFinancialReport(db,db,company,{from:"2026-09-15",to:"2026-09-30"});
 expect(r.production).toEqual([]);expect(db.from).not.toHaveBeenCalled();
});
