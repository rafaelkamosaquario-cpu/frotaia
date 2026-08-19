import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRadarsForCompany } from "@/services/supabase/freightRadarService";
import { listMatchesWithOpportunityForCompany } from "@/services/supabase/freightMatchService";
import { listSourcesForCompany } from "@/services/supabase/freightSourceService";
import { listVehicles } from "@/services/supabase/vehicleService";
import { OportunidadesClient } from "./OportunidadesClient";

/**
 * Radar de Fretes (MVP) — freight_opportunities não tem RLS pra
 * `authenticated` (ver migration), então o join com os matches usa client
 * admin, sempre DEPOIS de loadFleetPanelAccess confirmar acesso via sessão.
 */
export default async function OportunidadesPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const admin = createAdminClient();
  const [radares, oportunidades, fontes, veiculos] = await Promise.all([
    listRadarsForCompany(supabase, access.company.id),
    listMatchesWithOpportunityForCompany(admin, access.company.id),
    listSourcesForCompany(supabase, access.company.id),
    listVehicles(supabase, access.company.id),
  ]);

  return (
    <OportunidadesClient
      radaresIniciais={radares}
      oportunidadesIniciais={oportunidades}
      fontesIniciais={fontes}
      veiculos={veiculos}
      podeEditar={access.role === "owner" || access.role === "admin"}
    />
  );
}
