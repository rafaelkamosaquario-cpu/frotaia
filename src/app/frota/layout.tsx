import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { FrotaShell } from "@/components/frota/FrotaShell";

/**
 * Painel de gestão de frota (V2) — área totalmente separada do painel V1
 * (chat em `/`), com seu próprio gate de acesso (fleet_panel_enabled por
 * empresa, ver fleetPanelAccess.ts). Não usa CUSTOMER_PANEL_ENABLED nem
 * profiles.is_admin — são controles do V1, não tocados aqui.
 *
 * Google Calendar (fechamento de coerência, 08/2026): DEIXOU de ser
 * requisito global pra acessar o painel — era bloqueio pra 15 das 17 telas
 * que nunca tocam Google. Agora é contextual: só `/frota/agenda` (e o
 * gate do próprio onboarding do painel, ver frota-ativacao) checa Calendar
 * conectado, cada uma na própria tela. As rotas de API de agenda já
 * tratavam "desconectado" com 409 próprio, independente deste layout.
 *
 * Onboarding 2 (Frota IA Gestão, 08/2026): só falta confirmar que o
 * cliente já passou pelo wizard de ativação do painel
 * (`companies.fleet_onboarding_completed_at`) — que reaproveita a
 * empresa/veículo já criados pelo onboarding V1 do WhatsApp, nunca
 * duplica. Fica em `/frota-ativacao` (fora de src/app/frota, mesmo motivo
 * de frota-indisponivel — evitar loop de redirect com este layout).
 */
export default async function FrotaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    if (access.reason === "no_company") redirect("/onboarding");
    redirect("/frota-indisponivel");
  }

  if (!access.company.fleet_onboarding_completed_at) redirect("/frota-ativacao");

  return (
    <FrotaShell companyName={access.company.name} role={access.role}>
      {children}
    </FrotaShell>
  );
}
