import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getOrCreatePreferences, updatePreferences } from "@/services/supabase/companyPreferencesService";

const ESTILOS_VALIDOS = ["simples", "tecnico", "objetivo"];

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
  if (typeof body.preferredResponseStyle !== "string" || !ESTILOS_VALIDOS.includes(body.preferredResponseStyle)) {
    return NextResponse.json({ error: `preferredResponseStyle precisa ser um de: ${ESTILOS_VALIDOS.join(", ")}.` }, { status: 400 });
  }

  try {
    await getOrCreatePreferences(supabase, access.company.id);
    const preferencias = await updatePreferences(supabase, access.company.id, access.userId, {
      preferredResponseStyle: body.preferredResponseStyle,
    });
    return NextResponse.json({ preferencias });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar a preferência — só o dono/administrador da empresa pode alterar." }, { status: 403 });
  }
}
