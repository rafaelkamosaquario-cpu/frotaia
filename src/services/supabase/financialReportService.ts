import type { SupabaseDbClient } from "./types";
import { listExpenses } from "./expenseService";
import { listRevenues } from "./revenueService";
import { listVehiclesForPanel } from "./vehicleService";
import { listDriversForPanel } from "./driverService";
import { readAllPages } from "./readAllPages";
import type { CostEntry } from "@/lib/frota/costs";
import { categories } from "@/lib/frota/costs";
import { EXPENSE_TYPE_LABEL } from "@/lib/frota/relatoriosAggregation";
import type { FinancialReportInput } from "@/services/documents/financialReport";
import { reportMonth } from "@/services/documents/financialReport";
import type { MonthlyProduction } from "@/lib/frota/productionGoals";

/** Read-only. Admin client is supplied only after route authorization, always scoped to company + expense IDs. */
export async function loadFinancialReport(client: SupabaseDbClient, admin: SupabaseDbClient, company: {id:string;name:string}, filter: {from:string;to:string;vehicleId?:string}): Promise<FinancialReportInput> {
  const [expenses, revenues, vehicles, drivers] = await Promise.all([
    listExpenses(client,{companyId:company.id,dateFrom:filter.from,dateTo:filter.to,vehicleId:filter.vehicleId,all:true}),
    listRevenues(client,{companyId:company.id,dateFrom:filter.from,dateTo:filter.to,vehicleId:filter.vehicleId,all:true}),
    listVehiclesForPanel(client,company.id), listDriversForPanel(client,company.id),
  ]);
  if(filter.vehicleId && !vehicles.some(v=>v.id===filter.vehicleId))throw new Error("Veículo fora da empresa selecionada.");
  const month=reportMonth(filter.from,filter.to);
  const production=month?await readAllPages<MonthlyProduction>(async(offset,size)=>{
    let query=client.from("fleet_monthly_production").select("*").eq("company_id",company.id).eq("month",month);
    if(filter.vehicleId)query=query.eq("vehicle_id",filter.vehicleId);
    const {data,error}=await query.order("vehicle_id").range(offset,offset+size-1);
    if(error)throw error;
    return (data??[]) as unknown as MonthlyProduction[];
  }):[];
  const links = new Map<string,CostEntry>();
  for(let start=0;start<expenses.length;start+=100) {
    const ids=expenses.slice(start,start+100).map(e=>e.id);
    const rows=await readAllPages<CostEntry>(async(offset,size)=>{
      const {data,error}=await admin.from("cost_entries").select("*").eq("company_id",company.id).in("expense_id",ids).order("id").range(offset,offset+size-1);
      if(error)throw error;
      return (data??[]) as unknown as CostEntry[];
    });
    for(const row of rows)if(row.expense_id) {
      if(links.has(row.expense_id))throw new Error("Vínculo de remuneração duplicado.");
      links.set(row.expense_id,row);
    }
  }
  return {
    company:company.name, from:filter.from,to:filter.to,generatedAt:new Date(),
    scope:filter.vehicleId?"Veículo selecionado":"Todos os veículos", vehicles, production,
    revenues:revenues.map(r=>({id:r.id,date:r.revenue_date,vehicleId:r.vehicle_id,amount:r.amount,category:"Receita",
      description:r.description??"",person:drivers.find(d=>d.id===r.driver_id)?.name,
      status:r.settlement_status??"unknown",settledOn:r.settled_on??null})),
    expenses:expenses.map(e=>{
      const entry=links.get(e.id), salary=entry?.snapshot.category==="salario";
      return {id:e.id,date:e.expense_date,vehicleId:e.vehicle_id,amount:e.amount,
        category:entry?categories[entry.snapshot.category]??EXPENSE_TYPE_LABEL[e.expense_type]:EXPENSE_TYPE_LABEL[e.expense_type],
        description:salary?entry.snapshot.name:e.description??"",person:entry?.snapshot.person||e.vendor||undefined,
        status:e.settlement_status??"unknown",settledOn:e.settled_on??null,
        ...(salary?{payroll:{month:entry.month,dueDate:entry.due_date,advances:(entry.snapshot.advances??[]).reduce((s,a)=>s+Math.round(a.amount*100),0)/100}}:{}),
      };
    }),
  };
}
