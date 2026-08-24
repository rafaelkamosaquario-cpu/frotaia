import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listMaintenanceLinkedExpenses } from "@/services/supabase/expenseService";
import { ManutencaoClient } from "./ManutencaoClient";

/**
 * O layout de src/app/frota já garante o acesso — esta página busca os
 * dados iniciais no servidor. veiculos busca a lista COMPLETA (não só
 * ativos) pra exibir corretamente o veículo de uma manutenção mesmo que
 * ele tenha sido desativado depois; o subconjunto ativo é derivado no
 * client só pras opções do formulário.
 */
export default async function ManutencaoPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [manutencoesIniciais, veiculos, despesasVinculadas] = await Promise.all([
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
    listMaintenanceLinkedExpenses(supabase, access.company.id),
  ]);

  return <ManutencaoClient manutencoesIniciais={manutencoesIniciais} veiculos={veiculos} despesasVinculadas={despesasVinculadas} />;
}
