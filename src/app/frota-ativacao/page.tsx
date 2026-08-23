import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { checkCalendarConnection } from "@/services/google/googleCalendarService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { AtivacaoFlow } from "./AtivacaoFlow";

/**
 * Onboarding 2 — ativação do Painel de Gestão (Frota IA Gestão, 08/2026).
 * Reaproveita integralmente a empresa e o(s) veículo(s) já criados pelo
 * onboarding V1 do WhatsApp — nunca cria empresa nova, nunca duplica
 * veículo (ver AtivacaoFlow.tsx). Fica FORA de src/app/frota, mesmo motivo
 * de /frota-conectar-agenda e /frota-indisponivel: não pode herdar o
 * layout gated, porque é justamente o destino de quem ainda não passou
 * por uma das condições dele (fleet_onboarding_completed_at nulo) — os
 * requisitos anteriores (sessão, empresa, entitlement, Calendar) são
 * replicados aqui de propósito.
 */
export default async function FrotaAtivacaoPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    if (access.reason === "no_company") redirect("/onboarding");
    redirect("/frota-indisponivel");
  }

  const calendarConnected = await checkCalendarConnection(access.company.id)
    .then((status) => status.connected)
    .catch(() => false);
  if (!calendarConnected) redirect("/frota-conectar-agenda");

  // Já concluiu antes — nunca mostra o wizard de novo, vai direto pro painel.
  if (access.company.fleet_onboarding_completed_at) redirect("/frota/dashboard");

  const [veiculos, motoristas, documentos, preferencias] = await Promise.all([
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listVehicleDocumentsForPanel(supabase, access.company.id),
    getOrCreatePreferences(supabase, access.company.id),
  ]);

  return (
    <AtivacaoFlow
      company={access.company}
      veiculosIniciais={veiculos}
      motoristasIniciais={motoristas}
      documentos={documentos}
      preferenciasIniciais={preferencias}
    />
  );
}
