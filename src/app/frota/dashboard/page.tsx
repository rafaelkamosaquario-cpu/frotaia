import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listExpenses } from "@/services/supabase/expenseService";
import { DashboardClient } from "./DashboardClient";

/** O layout de src/app/frota já garante o acesso. Só leitura — os KPIs agregam dados que as telas de Veículos/Motoristas/Manutenção/Documentos/Despesas já buscam. */
export default async function DashboardPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

  const [veiculos, motoristas, manutencoes, documentos, despesasRecentes] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listMaintenanceSchedulesForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listExpenses(supabase, { companyId: access.company.id, dateFrom: trintaDiasAtras.toISOString().slice(0, 10), limit: 500 }),
  ]);

  return (
    <DashboardClient
      veiculos={veiculos}
      motoristas={motoristas}
      manutencoes={manutencoes}
      documentos={documentos}
      despesasRecentes={despesasRecentes}
    />
  );
}
