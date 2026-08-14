import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listAnalysisRuns } from "@/services/supabase/analysisHistoryService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { FretesClient } from "./FretesClient";

/**
 * O layout de src/app/frota já garante o acesso. Tela read-only —
 * `analisar_frete` (WhatsApp) já grava sempre em `analysis_runs`
 * (nenhuma simulação é descartável hoje), então não falta tabela nova
 * aqui, só uma tela lendo o que já existe (plano de unificação V1+V2,
 * Fase 9).
 */
export default async function FretesPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [analises, veiculos] = await Promise.all([
    listAnalysisRuns(supabase, { companyId: access.company.id, analysisTypes: ["analisar_frete"], limit: 100 }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <FretesClient analises={analises} veiculos={veiculos} />;
}
