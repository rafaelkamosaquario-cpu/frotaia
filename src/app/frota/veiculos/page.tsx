import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { VeiculosClient } from "./VeiculosClient";

/**
 * O layout de src/app/frota já garante o acesso — esta página busca os
 * dados iniciais no servidor (evita um round-trip de loading vazio no
 * client, mesmo espírito do HomeClient).
 */
export default async function VeiculosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  // O layout já redireciona se !access.ok — chegar aqui implica ok=true.
  if (!access.ok) return null;

  const veiculosIniciais = await listVehiclesForPanel(supabase, access.company.id);

  return <VeiculosClient veiculosIniciais={veiculosIniciais} />;
}
