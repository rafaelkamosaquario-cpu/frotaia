import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehicleTires } from "@/services/supabase/vehicleTireService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { PneusClient } from "./PneusClient";

/** O layout de src/app/frota já garante o acesso. Painel e WhatsApp (gerenciar_pneu_veiculo) usam os mesmos services (vehicleTireService.ts), sempre a mesma fonte de dado. */
export default async function PneusPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [pneus, veiculos] = await Promise.all([
    listVehicleTires(supabase, { companyId: access.company.id }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <PneusClient pneusIniciais={pneus} veiculos={veiculos} />;
}
