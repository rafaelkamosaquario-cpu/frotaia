import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getOrCreatePreferences, updatePreferences } from "@/services/supabase/companyPreferencesService";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();
  if (typeof body.dailyNewsEnabled !== "boolean") {
    return NextResponse.json({ error: "dailyNewsEnabled precisa ser true ou false." }, { status: 400 });
  }

  try {
    // Garante que a linha de preferências existe antes de atualizar (mesmo padrão usado no onboarding via WhatsApp).
    await getOrCreatePreferences(supabase, access.company.id);
    const preferencias = await updatePreferences(supabase, access.company.id, access.userId, { dailyNewsEnabled: body.dailyNewsEnabled });
    return NextResponse.json({ preferencias });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar a preferência — só o dono/administrador da empresa pode alterar." }, { status: 403 });
  }
}
