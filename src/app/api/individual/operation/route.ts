import {NextResponse} from "next/server";
import {individualAccess} from "@/services/supabase/individualAccess";
import {listExpenses} from "@/services/supabase/expenseService";
import {listRevenues} from "@/services/supabase/revenueService";
import {listFuelFillups} from "@/services/supabase/fuelFillupService";
import {resolveDefaultVehicle} from "@/services/supabase/vehicleService";
import {listUpcomingAlerts} from "@/services/supabase/alertService";
import {listGeneratedDocuments} from "@/services/supabase/generatedDocumentService";
import {operationPeriod,currentOperationMonth,financialSummary,type OperationData} from "@/lib/individual/operation";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  const month=new URL(request.url).searchParams.get("month")??currentOperationMonth();
  let period;try{period=operationPeriod(month);}catch{return NextResponse.json({error:"Selecione um mês válido."},{status:400,headers});}
  try {
    const access=await individualAccess();
    if(!access.ok)return NextResponse.json({error:"Entre com uma conta autorizada e com acesso ativo."},{status:access.status,headers});
    const {client,company,enabled}=access;const allows=(id:string)=>enabled.includes(id);
    const filter={companyId:company.id,dateFrom:period.from,dateTo:period.to,all:true};
    const [vehicle,expenses,revenues,fuel,alerts,documents,maintenance,tires,analyses]=await Promise.all([
      allows("frota")?resolveDefaultVehicle(client,company.id):null,
      allows("financeiro")?listExpenses(client,filter):[],allows("financeiro")?listRevenues(client,filter):[],
      allows("financeiro")?listFuelFillups(client,{...filter,limit:100}):[],
      allows("avisos")?listUpcomingAlerts(client,company.id,20):[],
      allows("gerados")?listGeneratedDocuments(client,{companyId:company.id,limite:20}):{itens:[]},
      allows("manutencao")?client.from("maintenance_schedules").select("id,type,due_date,status,next_due_km").eq("company_id",company.id).order("due_date",{ascending:false}).limit(50):{data:[],error:null},
      allows("pneus")?client.from("vehicle_tires").select("id,brand,model,position,status").eq("company_id",company.id).order("created_at",{ascending:false}).limit(50):{data:[],error:null},
      // Restricted enterprise configurations do not expose cross-module analysis history.
      enabled.length===ALL_COUNT?client.from("analysis_runs").select("id,started_at,user_request,analysis_type,result_summary").eq("company_id",company.id).eq("status","completed").gte("started_at",`${period.from}T00:00:00-03:00`).lte("started_at",`${period.to}T23:59:59.999-03:00`).order("started_at",{ascending:false}).limit(30):{data:[],error:null}
    ]);
    if(analyses.error||maintenance.error||tires.error)throw new Error("Consulta indisponível");
    const data:OperationData={company:company.name,month,updatedAt:new Date().toISOString(),enabled:[...enabled],vehicle:vehicle?{name:vehicle.name,plate:vehicle.plate}:null,
      summary:allows("financeiro")?financialSummary(expenses,revenues):null,
      expenses:expenses.slice(0,100).map(r=>({id:r.id,date:r.expense_date,amount:Number(r.amount),label:r.description||r.expense_type,status:r.settlement_status??"unknown"})),
      revenues:revenues.slice(0,100).map(r=>({id:r.id,date:r.revenue_date,amount:Number(r.amount),label:r.description||"Receita registrada",status:r.settlement_status??"unknown"})),
      expenseCount:expenses.length,revenueCount:revenues.length,
      fuel:fuel.map(r=>({id:r.id,date:r.fillup_date,liters:Number(r.liters),amount:Number(r.total_amount),km:r.odometer_km})),
      analyses:(analyses.data??[]).map(r=>({id:r.id,date:r.started_at,title:r.user_request||r.analysis_type,summary:r.result_summary})),
      alerts:alerts.map(r=>({id:r.id,date:r.scheduled_for,title:r.title})),
      documents:documents.itens.map(r=>({id:r.id,date:r.created_at,title:r.title,available:!!r.storage_path})),
      maintenance:(maintenance.data??[]).map(r=>({id:r.id,date:r.due_date,title:r.type,status:r.status,nextKm:r.next_due_km})),
      tires:(tires.data??[]).map(r=>({id:r.id,title:[r.brand,r.model].filter(Boolean).join(" ")||"Pneu cadastrado",position:r.position,status:r.status}))};
    return NextResponse.json(data,{headers});
  }catch{return NextResponse.json({error:"Não foi possível carregar os registros. Tente atualizar; valores indisponíveis não significam zero."},{status:503,headers});}
}
import {ALL_MODULE_IDS} from "@/lib/frota/companyModules";
const ALL_COUNT=ALL_MODULE_IDS.length;
