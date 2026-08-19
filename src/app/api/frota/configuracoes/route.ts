import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getOrCreatePreferences, updatePreferences } from "@/services/supabase/companyPreferencesService";
import { CHECKLIST_ITEM_LABELS } from "@/services/supabase/checklistDispatchService";

const ESTILOS_VALIDOS = ["simples", "tecnico", "objetivo"];
const ITENS_VALIDOS = Object.keys(CHECKLIST_ITEM_LABELS);

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

  if (body.preferredResponseStyle !== undefined && !ESTILOS_VALIDOS.includes(body.preferredResponseStyle)) {
    return NextResponse.json({ error: `preferredResponseStyle precisa ser um de: ${ESTILOS_VALIDOS.join(", ")}.` }, { status: 400 });
  }
  if (body.checklistSendHour !== undefined && (typeof body.checklistSendHour !== "number" || body.checklistSendHour < 0 || body.checklistSendHour > 23)) {
    return NextResponse.json({ error: "checklistSendHour precisa ser um número entre 0 e 23." }, { status: 400 });
  }
  if (body.checklistItemKeys !== undefined) {
    if (!Array.isArray(body.checklistItemKeys) || body.checklistItemKeys.some((chave: unknown) => !ITENS_VALIDOS.includes(chave as string))) {
      return NextResponse.json({ error: `checklistItemKeys só aceita: ${ITENS_VALIDOS.join(", ")}.` }, { status: 400 });
    }
  }

  try {
    await getOrCreatePreferences(supabase, access.company.id);
    const preferencias = await updatePreferences(supabase, access.company.id, access.userId, body);
    return NextResponse.json({ preferencias });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar a preferência — só o dono/administrador da empresa pode alterar." }, { status: 403 });
  }
}
