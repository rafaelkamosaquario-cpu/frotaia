import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { AlertasClient } from "./AlertasClient";

/** O layout de src/app/frota já garante o acesso. Só leitura — deriva a lista de itens que precisam de atenção a partir dos dados que Manutenção/Documentos já buscam. */
export default async function AlertasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [veiculos, manutencoes, documentos] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
  ]);

  return <AlertasClient veiculos={veiculos} manutencoes={manutencoes} documentos={documentos} />;
}
