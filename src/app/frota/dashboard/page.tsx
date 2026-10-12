import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listChecklistDispatchesForPanel } from "@/services/supabase/checklistDispatchService";
import { DashboardClient } from "./DashboardOverview";
import type { OperationalGroup } from "@/lib/frota/operationalGroups";
import { modulePathAllowed } from "@/lib/frota/companyModules";

/** One read-only dashboard for full and configured delivery; same company isolation. */
export default async function DashboardPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) return null;
  // Consultant permissions do not select a different customer-facing layout.
  const enabled = access.moduleConfig?.enabled ?? null;
  const allows = (path: string) => modulePathAllowed(enabled, path);
  const canManageGroups = ["owner", "admin"].includes(access.role);
  const groupResult = canManageGroups && allows("/frota/grupos")
    ? await supabase.rpc("manage_operational_groups", { p_company: access.company.id, p_action: "list" })
    : null;
  const groups = Array.isArray(groupResult?.data) ? groupResult.data as OperationalGroup[] : [];
  const [veiculos, motoristas, manutencoes, documentos, checklistDispatches] = await Promise.all([
    allows("/frota/veiculos") ? listVehiclesForPanel(supabase, access.company.id) : Promise.resolve([]),
    allows("/frota/motoristas") ? listDriversForPanel(supabase, access.company.id) : Promise.resolve([]),
    allows("/frota/manutencao") ? listMaintenanceSchedulesForPanel(supabase, access.company.id) : Promise.resolve([]),
    allows("/frota/documentos") ? listVehicleDocumentsForPanel(supabase, access.company.id) : Promise.resolve([]),
    allows("/frota/checklists") ? listChecklistDispatchesForPanel(supabase, access.company.id) : Promise.resolve([]),
  ]);
  return <DashboardClient key={access.company.id} companyId={access.company.id}
    companyName={access.company.name} enabledModules={enabled}
    groups={groups} groupsError={!!groupResult?.error} canManageGroups={canManageGroups}
    veiculos={veiculos} motoristas={motoristas} manutencoes={manutencoes}
    documentos={documentos} checklistDispatches={checklistDispatches} />;
}
