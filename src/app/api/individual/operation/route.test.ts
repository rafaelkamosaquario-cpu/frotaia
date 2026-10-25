import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),expenses:vi.fn(),revenues:vi.fn(),fuel:vi.fn(),vehicle:vi.fn(),alerts:vi.fn(),docs:vi.fn()}));
vi.mock("@/services/supabase/individualAccess",()=>({individualAccess:m.access}));
vi.mock("@/services/supabase/expenseService",()=>({listExpenses:m.expenses}));
vi.mock("@/services/supabase/revenueService",()=>({listRevenues:m.revenues}));
vi.mock("@/services/supabase/fuelFillupService",()=>({listFuelFillups:m.fuel}));
vi.mock("@/services/supabase/vehicleService",()=>({resolveDefaultVehicle:m.vehicle}));
vi.mock("@/services/supabase/alertService",()=>({listUpcomingAlerts:m.alerts}));
vi.mock("@/services/supabase/generatedDocumentService",()=>({listGeneratedDocuments:m.docs}));
import {GET} from "./route";
import {ALL_MODULE_IDS} from "@/lib/frota/companyModules";
const run=(query="month=2026-09")=>GET(new Request(`https://test/api/individual/operation?${query}`));
describe("operação compartilhada por vínculo",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.access.mockResolvedValue({ok:true,client:{},company:{id:"c",name:"Empresa"},enabled:["financeiro"]});m.expenses.mockResolvedValue([]);m.revenues.mockResolvedValue([]);m.fuel.mockResolvedValue([]);});
 it("nega sem acesso antes de ler registros",async()=>{m.access.mockResolvedValue({ok:false,status:403});expect((await run()).status).toBe(403);expect(m.expenses).not.toHaveBeenCalled();});
 it("valida período",async()=>{expect((await run("month=2026-99")).status).toBe(400);expect(m.expenses).not.toHaveBeenCalled();});
 it("ignora empresa enviada na URL e usa vínculo, com totais completos",async()=>{const r=await run("month=2026-09&companyId=outra");expect(r.status).toBe(200);expect(m.expenses).toHaveBeenCalledWith({},expect.objectContaining({companyId:"c",all:true,dateFrom:"2026-09-01",dateTo:"2026-09-30"}));});
 it("não consulta módulos desativados",async()=>{m.access.mockResolvedValue({ok:true,client:{},company:{id:"c",name:"Empresa"},enabled:[]});const data=await (await run()).json();expect(data.summary).toBeNull();expect(m.expenses).not.toHaveBeenCalled();});
 it("erro não vira resumo zerado",async()=>{m.expenses.mockRejectedValue(new Error("db"));expect((await run()).status).toBe(503);});
 it("carrega todas as categorias com escopo de empresa e não soma combustível duas vezes",async()=>{
   const eq=vi.fn();const query:{[key:string]:unknown}={};
   for(const method of ["select","eq","gte","lte","order","limit"]){query[method]=(...args:unknown[])=>{if(method==="eq")eq(...args);return query;};}
   query.then=(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(resolve);
   const client={from:vi.fn(()=>query)};
   m.access.mockResolvedValue({ok:true,client,company:{id:"c",name:"Empresa"},enabled:ALL_MODULE_IDS});
   m.vehicle.mockResolvedValue(null);m.alerts.mockResolvedValue([]);m.docs.mockResolvedValue({itens:[]});
   m.expenses.mockResolvedValue([{id:"e",amount:100,expense_type:"combustivel",expense_date:"2026-09-01"}]);
   m.fuel.mockResolvedValue([{id:"f",liters:10,total_amount:100,fillup_date:"2026-09-01",odometer_km:null}]);
   const r=await run();expect(r.status).toBe(200);const body=await r.json();expect(body.summary.expenses).toBe(100);expect(body.fuel[0].amount).toBe(100);expect(eq.mock.calls.filter(args=>args[0]==="company_id")).toEqual([["company_id","c"],["company_id","c"],["company_id","c"]]);
 });
});
