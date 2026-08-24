import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateEvent, deleteEvent, GoogleCalendarNotConnectedError } from "@/services/google/googleCalendarService";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json().catch(() => null);

  try {
    const evento = await updateEvent({
      userId: access.userId,
      companyId: access.company.id,
      eventId,
      title: typeof body?.title === "string" ? body.title.trim() : undefined,
      startIso: typeof body?.startIso === "string" ? body.startIso : undefined,
      endIso: typeof body?.endIso === "string" ? body.endIso : undefined,
      timezone: typeof body?.startIso === "string" || typeof body?.endIso === "string" ? "America/Sao_Paulo" : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      location: typeof body?.location === "string" ? body.location : undefined,
    });
    return NextResponse.json({ evento });
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar não está conectado." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível salvar o evento agora. Tente novamente." }, { status: 502 });
  }
}

/** Exclusão só chega aqui depois do usuário confirmar num diálogo na própria tela — mesma exigência de confirmação explícita da ferramenta de IA, só que a confirmação acontece na UI em vez de um parâmetro. */
export async function DELETE(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  try {
    await deleteEvent({ userId: access.userId, companyId: access.company.id, eventId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar não está conectado." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível excluir o evento agora. Tente novamente." }, { status: 502 });
  }
}
