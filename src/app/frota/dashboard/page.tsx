import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { DashboardClient } from "./DashboardClient";

/** O layout de src/app/frota já garante o acesso. Só leitura — os 4 KPIs agregam dados que as telas de Veículos/Motoristas/Manutenção/Documentos já buscam. */
export default async function DashboardPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [veiculos, motoristas, manutencoes, documentos] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
  ]);

  return <DashboardClient veiculos={veiculos} motoristas={motoristas} manutencoes={manutencoes} documentos={documentos} />;
}
