import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRoutes } from "@/services/supabase/savedRouteService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { RotasClient } from "./RotasClient";

/** O layout de src/app/frota já garante o acesso. Tela read-only por enquanto — rota é salva/editada via WhatsApp (gerenciar_rota_salva). */
export default async function RotasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [rotas, veiculos] = await Promise.all([
    listRoutes(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <RotasClient rotas={rotas} veiculos={veiculos} />;
}
