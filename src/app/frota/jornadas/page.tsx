import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listSavedJourneysForPanel } from "@/services/supabase/savedJourneyService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { JornadasClient } from "./JornadasClient";

/** O layout de src/app/frota já garante o acesso. Tela read-only por enquanto — jornada é salva só via WhatsApp (gerenciar_jornada_salva). */
export default async function JornadasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [jornadasIniciais, motoristas, veiculos] = await Promise.all([
    listSavedJourneysForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <JornadasClient jornadas={jornadasIniciais} motoristas={motoristas} veiculos={veiculos} />;
}
