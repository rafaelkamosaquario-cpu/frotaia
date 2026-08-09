import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { FrotaShell } from "@/components/frota/FrotaShell";

/**
 * Painel de gestão de frota (V2) — área totalmente separada do painel V1
 * (chat em `/`), com seu próprio gate de acesso (fleet_panel_enabled por
 * empresa, ver fleetPanelAccess.ts). Não usa CUSTOMER_PANEL_ENABLED nem
 * profiles.is_admin — são controles do V1, não tocados aqui.
 */
export default async function FrotaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) {
    if (access.reason === "unauthenticated") redirect("/login");
    if (access.reason === "no_company") redirect("/onboarding");
    redirect("/frota-indisponivel");
  }

  return (
    <FrotaShell companyName={access.company.name} role={access.role}>
      {children}
    </FrotaShell>
  );
}
