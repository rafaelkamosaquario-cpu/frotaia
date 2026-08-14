import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listExpenses } from "@/services/supabase/expenseService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { DespesasClient } from "./DespesasClient";

/** O layout de src/app/frota já garante o acesso — esta página busca os dados iniciais no servidor. */
export default async function DespesasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [despesasIniciais, veiculos] = await Promise.all([
    listExpenses(supabase, { companyId: access.company.id, limit: 200 }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <DespesasClient despesasIniciais={despesasIniciais} veiculos={veiculos} />;
}
