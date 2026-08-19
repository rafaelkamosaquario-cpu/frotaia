import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listMatchesWithOpportunityForCompany } from "@/services/supabase/freightMatchService";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

/**
 * freight_opportunities não tem RLS pra `authenticated` (sem escopo de
 * empresa — ver migration) — por isso, diferente do resto do painel, esta
 * rota usa client admin pro join DEPOIS de confirmar acesso via sessão. Os
 * matches em si (que sim são por empresa) já vêm filtrados por companyId.
 */
export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const admin = createAdminClient();
  const oportunidades = await listMatchesWithOpportunityForCompany(admin, access.company.id);
  return NextResponse.json({ oportunidades });
}
