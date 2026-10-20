import { expect,it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { financialSummary,generateFinancialReport,productionAnalysis,reportMonth,type FinancialReportInput,type FinancialLine } from "./financialReport";
const line=(amount:number,extra:Partial<FinancialLine>={}):FinancialLine=>({id:"e",date:"2026-09-30",amount,vehicleId:"v",description:"Descrição",category:"Outro",status:"settled",settledOn:"2026-10-06",...extra});
const input=(expenses:FinancialLine[],revenues:FinancialLine[]=[]):FinancialReportInput=>({company:"Empresa Proença",from:"2026-09-01",to:"2026-09-30",generatedAt:new Date("2026-10-19T12:00:00Z"),scope:"Todos os veículos",vehicles:[{id:"v",plate:"ABC1234",name:"Caminhão"}],expenses,revenues});
it("conserva centavos, folha já incluída e baixa de outubro na competência setembro",()=>{
 const r=financialSummary(input([line(100,{category:"Salário",payroll:{month:"2026-09",dueDate:"2026-10-06",advances:20}}),line(.1),line(.2)],[line(200)]));
 expect(r.expense).toBe(100.3);expect(r.balance).toBe(99.7);expect(r.vehicles[0].payroll).toBe(100);expect(r.expenses.settled).toBe(100.3);
});
it("não trata ausência de baixa como pendência e não inventa rateio",()=>{
 const r=financialSummary(input([line(20,{status:"unknown",settledOn:null,vehicleId:null}),line(30,{status:"pending",settledOn:null})]));
 expect(r.expenses).toEqual({settled:0,pending:30,unknown:20});expect(r.vehicles.find(v=>v.id===null)?.expense).toBe(20);
});
it("rejeita valores não finitos",()=>expect(()=>financialSummary(input([line(NaN)]))).toThrow());
it("compara metas reais e não classifica apuração parcial como fracasso",()=>{
 const r=input([]);
 const row={company_id:"c",vehicle_id:"v",month:"2026-09",operation:"transporte" as const,target_tonnes:850,actual_tonnes:535.46,diesel_liters:null,measured_through:"2026-09-30",note:"",revision:1,updated_at:""};
 r.production=[row,{...row,target_tonnes:600,actual_tonnes:600},{...row,target_tonnes:null},{...row,actual_tonnes:null},{...row,measured_through:"2026-09-20"}];
 const a=productionAnalysis(r);
 expect(a[0].percent).toBeCloseTo(62.9953);expect(a[0].label).toBe("Meta não atingida");
 expect(a[1].label).toBe("Meta atingida");expect(a[2].label).toBe("Sem meta");
 expect(a[3].label).toBe("Sem produção informada");expect(a[4].label).toBe("Apuração parcial");
 expect(reportMonth("2026-09-02","2026-09-30")).toBeNull();
 expect(reportMonth("2024-02-01","2024-02-29")).toBe("2024-02");
});
it("gera PDF paginado com nomes, acentos, descrição longa e metadados",async()=>{
 const bytes=await generateFinancialReport(input([line(10,{description:"Histórico de manutenção João Proença. ".repeat(300)})]));
 const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(4);expect(pdf.getTitle()).toContain("2026-09-01");
 for(const page of pdf.getPages())expect(page.getWidth()).toBeCloseTo(841.89);
});
