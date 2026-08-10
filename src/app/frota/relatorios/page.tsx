import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { RelatoriosClient } from "./RelatoriosClient";

/** O layout de src/app/frota já garante o acesso. Só leitura — agrega os mesmos dados que Veículos/Motoristas/Manutenção/Documentos já buscam. */
export default async function RelatoriosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [veiculos, motoristas, manutencoes, documentos] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
  ]);

  return <RelatoriosClient veiculos={veiculos} motoristas={motoristas} manutencoes={manutencoes} documentos={documentos} />;
}
