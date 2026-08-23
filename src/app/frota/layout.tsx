import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { checkCalendarConnection } from "@/services/google/googleCalendarService";
import { FrotaShell } from "@/components/frota/FrotaShell";

/**
 * Painel de gestão de frota (V2) — área totalmente separada do painel V1
 * (chat em `/`), com seu próprio gate de acesso (fleet_panel_enabled por
 * empresa, ver fleetPanelAccess.ts). Não usa CUSTOMER_PANEL_ENABLED nem
 * profiles.is_admin — são controles do V1, não tocados aqui.
 *
 * Google Calendar conectado é obrigatório pra usar o painel (unificação de
 * identidade WhatsApp+Painel, decisão do Rafael) — checado por empresa
 * (`checkCalendarConnection`, não mais por usuário, ver A.1). O destino
 * fica FORA de src/app/frota (frota-conectar-agenda, mesmo motivo de
 * frota-indisponivel) pra não entrar em loop de redirect com este layout.
 *
 * Onboarding 2 (Frota IA Gestão, 08/2026): depois de Calendar conectado,
 * falta só confirmar que o cliente já passou pelo wizard de ativação do
 * painel (`companies.fleet_onboarding_completed_at`) — que reaproveita a
 * empresa/veículo já criados pelo onboarding V1 do WhatsApp, nunca
 * duplica. Fica em `/frota-ativacao` (fora de src/app/frota, mesmo motivo
 * das outras duas rotas acima).
 */
export default async function FrotaLayout({ children }: { children: React.ReactNode }) {
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

  if (!access.company.fleet_onboarding_completed_at) redirect("/frota-ativacao");

  return (
    <FrotaShell companyName={access.company.name} role={access.role}>
      {children}
    </FrotaShell>
  );
}
