import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRevenues } from "@/services/supabase/revenueService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { ReceitasClient } from "./ReceitasClient";

/** O layout de src/app/frota já garante o acesso — esta página busca os dados iniciais no servidor. */
export default async function ReceitasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [receitasIniciais, veiculos, motoristas] = await Promise.all([
    listRevenues(supabase, { companyId: access.company.id, all: true }),
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
  ]);

  return <ReceitasClient receitasIniciais={receitasIniciais} veiculos={veiculos} motoristas={motoristas} canEdit={["owner","admin","operator"].includes(access.role)} />;
}
