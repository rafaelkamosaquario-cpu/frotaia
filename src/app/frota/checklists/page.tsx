import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listChecklistDispatchesForPanel } from "@/services/supabase/checklistDispatchService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { ChecklistsClient } from "./ChecklistsClient";

/** O layout de src/app/frota já garante o acesso. Tela 100% read-only — não existe automação de envio ainda. */
export default async function ChecklistsPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [dispatchesIniciais, motoristas, veiculos] = await Promise.all([
    listChecklistDispatchesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <ChecklistsClient dispatches={dispatchesIniciais} motoristas={motoristas} veiculos={veiculos} />;
}
