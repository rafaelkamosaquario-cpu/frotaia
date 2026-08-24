import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listAlertsForPanel } from "@/services/supabase/alertService";
import { AlertasClient } from "./AlertasClient";

/**
 * Alertas — módulo operacional real desde a Rodada 2 (evolução funcional
 * 08/2026, antes era só leitura). A tabela principal agora lê direto de
 * `scheduled_alerts` (via listAlertsForPanel), a mesma tabela/services que
 * `gerenciar_alerta` (WhatsApp/IA) e a sincronização automática de
 * manutenção/documento/checklist já usam — nunca um segundo sistema de
 * alertas. Busca uma janela ampla (últimos 30 dias + próximos 90) pra
 * cobrir atrasados/hoje/próximos/histórico sem paginação; filtros mais
 * finos são aplicados via fetch client-side (AlertasClient).
 */
export default async function AlertasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const agora = new Date();
  const de30DiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const em90Dias = new Date(agora.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [alertas, veiculos] = await Promise.all([
    listAlertsForPanel(supabase, {
      companyId: access.company.id,
      from: de30DiasAtras.toISOString(),
      to: em90Dias.toISOString(),
      limit: 300,
    }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  return <AlertasClient alertasIniciais={alertas} veiculos={veiculos} />;
}
