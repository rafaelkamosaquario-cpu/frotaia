import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listExpenses } from "@/services/supabase/expenseService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { DespesasClient } from "./DespesasClient";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalaryExpenseLink } from "@/lib/frota/salaryExpense";
import { readAllPages } from "@/services/supabase/readAllPages";

/** O layout de src/app/frota já garante o acesso — esta página busca os dados iniciais no servidor. */
export default async function DespesasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [despesasIniciais, veiculos] = await Promise.all([
    listExpenses(supabase, { companyId: access.company.id, all: true }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  const salarios: SalaryExpenseLink[] = [];
  if (despesasIniciais.length && ["owner", "admin", "operator"].includes(access.role)) {
    for (let start=0; start<despesasIniciais.length; start+=100) {
      const ids=despesasIniciais.slice(start,start+100).map(d=>d.id);
      const links = await readAllPages<SalaryExpenseLink>(async(offset,size)=>{
        const { data, error } = await createAdminClient().from("cost_entries")
          .select("id,expense_id,paid_on,month").eq("company_id", access.company.id)
          .eq("snapshot->>category", "salario").in("expense_id", ids).order("id").range(offset,offset+size-1);
        if(error)throw error;
        return (data??[]).filter((row):row is SalaryExpenseLink=>row.expense_id!==null);
      });
      salarios.push(...links);
    }
  }
  return <DespesasClient despesasIniciais={despesasIniciais} veiculos={veiculos} salarios={salarios} canEdit={["owner","admin","operator"].includes(access.role)} />;
}
