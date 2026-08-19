import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listUpcomingAlerts } from "@/services/supabase/alertService";
import { AlertasClient } from "./AlertasClient";

/**
 * O layout de src/app/frota já garante o acesso. A tabela principal segue
 * só leitura, derivada de Manutenção/Documentos (nunca fica desatualizada).
 * `lembretes` (achado da auditoria de sincronização) soma os alertas
 * "livres" criados via gerenciar_alerta no WhatsApp (scheduled_alerts sem
 * vínculo com veículo/manutenção/documento) — antes disso, esses lembretes
 * nunca apareciam em nenhuma tela do painel.
 */
export default async function AlertasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [veiculos, manutencoes, documentos, lembretes] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listUpcomingAlerts(supabase, access.company.id, 50),
  ]);

  return <AlertasClient veiculos={veiculos} manutencoes={manutencoes} documentos={documentos} lembretes={lembretes} />;
}
