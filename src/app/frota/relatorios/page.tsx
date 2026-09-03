import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listExpenses } from "@/services/supabase/expenseService";
import { listRevenues } from "@/services/supabase/revenueService";
import { listSavedJourneysForPanel } from "@/services/supabase/savedJourneyService";
import { listChecklistDispatchesForPanel } from "@/services/supabase/checklistDispatchService";
import { listAnalysisRuns } from "@/services/supabase/analysisHistoryService";
import { resolvePeriodo, filterRelatoriosInput } from "@/lib/frota/relatoriosAggregation";
import { RelatoriosClient } from "./RelatoriosClient";

/**
 * O layout de src/app/frota já garante o acesso. Só leitura — agrega os
 * mesmos dados que as outras telas já buscam. Fase 12 do plano de
 * unificação V1+V2 (blocos); evolução funcional 08/2026 (filtros reais de
 * período/veículo/motorista via query params — compartilhável/recarregável,
 * mesmo padrão usado pelo PDF em /api/frota/relatorios/pdf pra nunca divergir).
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const params = await searchParams;
  const asString = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const periodo = resolvePeriodo({ period: asString(params.period), from: asString(params.from), to: asString(params.to) });
  const vehicleId = asString(params.vehicleId) || undefined;
  const driverId = asString(params.driverId) || undefined;

  const [veiculos, motoristas, manutencoes, documentos, despesas, receitas, jornadas, checklistDispatches, analisesFrete] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listExpenses(supabase, { companyId: access.company.id, vehicleId, dateFrom: periodo.from, dateTo: periodo.to, limit: 500 }),
    listRevenues(supabase, { companyId: access.company.id, vehicleId, dateFrom: periodo.from, dateTo: periodo.to, limit: 500 }),
    listSavedJourneysForPanel(supabase, access.company.id),
    listChecklistDispatchesForPanel(supabase, access.company.id),
    listAnalysisRuns(supabase, { companyId: access.company.id, analysisTypes: ["analisar_frete"], dateFrom: periodo.from, limit: 500 }),
  ]);

  const filtrado = filterRelatoriosInput(
    { veiculos, motoristas, manutencoes, documentos, despesas, receitas, jornadas, checklistDispatches, analisesFrete },
    { from: periodo.from, to: periodo.to, vehicleId, driverId }
  );

  return (
    <RelatoriosClient
      {...filtrado}
      todosVeiculos={veiculos}
      todosMotoristas={motoristas}
      periodo={periodo}
      filtroAtual={{ vehicleId: vehicleId ?? "", driverId: driverId ?? "" }}
    />
  );
}
