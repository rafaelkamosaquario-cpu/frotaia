import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getGuideState, saveGuideState, markGuideOffered, type GuideStatus } from "@/services/supabase/companyPreferencesService";

/**
 * Estado do tour visual do Painel (V2/Gestão), 08/2026 — client de sessão
 * (RLS já isola `company_preferences` por membro da empresa, mesmo padrão
 * de `getOrCreatePreferences` chamado direto em dashboard/page.tsx). Guia ≠
 * onboarding — nunca toca `fleet_onboarding_completed_at`/entitlement.
 */

const STATUS_VALIDOS: GuideStatus[] = ["not_started", "in_progress", "completed", "dismissed"];

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const estado = await getGuideState(supabase, access.company.id, "v2");
  return NextResponse.json(estado);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown; step?: unknown; markOffered?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });

  if (body.markOffered) {
    await markGuideOffered(supabase, access.company.id, "v2");
  }

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUS_VALIDOS.includes(body.status as GuideStatus)) {
      return NextResponse.json({ error: "status inválido." }, { status: 400 });
    }
    const step = body.step === null || body.step === undefined ? null : String(body.step);
    await saveGuideState(supabase, access.company.id, "v2", { status: body.status as GuideStatus, step });
  }

  const estado = await getGuideState(supabase, access.company.id, "v2");
  return NextResponse.json(estado);
}
