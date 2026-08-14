import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listExpenses } from "@/services/supabase/expenseService";
import { listSavedJourneysForPanel } from "@/services/supabase/savedJourneyService";
import { listChecklistDispatchesForPanel } from "@/services/supabase/checklistDispatchService";
import { listAnalysisRuns } from "@/services/supabase/analysisHistoryService";
import { RelatoriosClient } from "./RelatoriosClient";

/**
 * O layout de src/app/frota já garante o acesso. Só leitura — agrega os
 * mesmos dados que as outras telas já buscam. Fase 12 do plano de
 * unificação V1+V2: blocos de Custos/Despesas, Jornadas, Checklists e
 * Análises/Fretes, sempre com dado real (sem número artificial).
 */
export default async function RelatoriosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const dataInicio = trintaDiasAtras.toISOString().slice(0, 10);

  const [veiculos, motoristas, manutencoes, documentos, despesas, jornadas, checklistDispatches, analisesFrete] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listExpenses(supabase, { companyId: access.company.id, dateFrom: dataInicio, limit: 500 }),
    listSavedJourneysForPanel(supabase, access.company.id),
    listChecklistDispatchesForPanel(supabase, access.company.id),
    listAnalysisRuns(supabase, { companyId: access.company.id, analysisTypes: ["analisar_frete"], dateFrom: dataInicio, limit: 500 }),
  ]);

  return (
    <RelatoriosClient
      veiculos={veiculos}
      motoristas={motoristas}
      manutencoes={manutencoes}
      documentos={documentos}
      despesas={despesas}
      jornadas={jornadas}
      checklistDispatches={checklistDispatches}
      analisesFrete={analisesFrete}
    />
  );
}
