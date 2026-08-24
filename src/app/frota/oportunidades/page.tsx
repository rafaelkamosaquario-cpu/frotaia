import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRadarsForCompany } from "@/services/supabase/freightRadarService";
import { listMatchesWithOpportunityForCompany } from "@/services/supabase/freightMatchService";
import { listSourcesForCompany } from "@/services/supabase/freightSourceService";
import { listVehicles } from "@/services/supabase/vehicleService";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { calcularMatch } from "@/lib/freight/matching";
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
  const [radares, oportunidadesBrutas, fontes, veiculos, preferencias] = await Promise.all([
    listRadarsForCompany(supabase, access.company.id),
    listMatchesWithOpportunityForCompany(admin, access.company.id),
    listSourcesForCompany(supabase, access.company.id),
    listVehicles(supabase, access.company.id),
    getOrCreatePreferences(supabase, access.company.id),
  ]);

  // `compatibility_score` já foi gravado na criação do match; `detalhes` é recalculado aqui em cima
  // dos mesmos dados (radar + oportunidade + veículo), com a mesma função pura do motor de matching —
  // nunca um texto inventado, só a explicação de um número que já existia.
  const oportunidades = oportunidadesBrutas.map((match) => {
    const radar = radares.find((r) => r.id === match.radar_id);
    const veiculo = match.vehicle_id ? veiculos.find((v) => v.id === match.vehicle_id) : null;
    const detalhes = radar ? calcularMatch(radar, match.opportunity, veiculo?.body_type ?? null).detalhes : [];
    return { ...match, detalhes };
  });

  return (
    <OportunidadesClient
      radaresIniciais={radares}
      oportunidadesIniciais={oportunidades}
      fontesIniciais={fontes}
      veiculos={veiculos}
      podeEditar={access.role === "owner" || access.role === "admin"}
      modoAnaliseInicial={preferencias.freight_radar_analysis_mode}
    />
  );
}
