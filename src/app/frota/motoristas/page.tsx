import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { MotoristasClient } from "./MotoristasClient";

/**
 * O layout de src/app/frota já garante o acesso — esta página busca os
 * dados iniciais no servidor. veiculos busca a lista COMPLETA (não só
 * ativos) pra exibir corretamente o vínculo de um motorista mesmo que o
 * veículo tenha sido desativado depois; o subconjunto ativo é derivado no
 * client só pras opções do formulário.
 */
export default async function MotoristasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [motoristasIniciais, veiculos] = await Promise.all([
    listDriversForPanel(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <MotoristasClient motoristasIniciais={motoristasIniciais} veiculos={veiculos} />;
}
