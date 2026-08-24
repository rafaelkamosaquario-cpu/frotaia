import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listUpcomingEvents, createEvent, GoogleCalendarNotConnectedError } from "@/services/google/googleCalendarService";

/**
 * Agenda visual do painel (evolução funcional 08/2026) — Google Calendar
 * continua sendo a única fonte de verdade, sem tabela nova nem cópia local
 * de evento. Reaproveita literalmente os mesmos services que
 * `gerenciar_google_calendar` (WhatsApp/IA) já usa — painel e WhatsApp
 * sempre veem os mesmos eventos, porque consultam a mesma API do Google em
 * tempo real (nenhum cache). O gate de `/frota/layout.tsx` já garante que
 * só se chega aqui com o Calendar conectado — mesmo assim tratamos
 * "desconectado" com um erro claro em vez de deixar a exceção crua vazar.
 */

const TIMEZONE_PADRAO = "America/Sao_Paulo";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  try {
    const resultado = await listUpcomingEvents({ companyId: access.company.id, from, to, maxResults: 100 });
    return NextResponse.json({ eventos: resultado.items });
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar não está conectado." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível consultar a agenda agora. Tente novamente." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const startIso = typeof body?.startIso === "string" ? body.startIso : "";
  const endIso = typeof body?.endIso === "string" ? body.endIso : "";
  if (!title || !startIso || !endIso) {
    return NextResponse.json({ error: "Título, início e fim são obrigatórios." }, { status: 400 });
  }

  try {
    const evento = await createEvent({
      userId: access.userId,
      companyId: access.company.id,
      title,
      startIso,
      endIso,
      timezone: TIMEZONE_PADRAO,
      description: typeof body?.description === "string" ? body.description : undefined,
      location: typeof body?.location === "string" ? body.location : undefined,
    });
    return NextResponse.json({ evento }, { status: 201 });
  } catch (error) {
    if (error instanceof GoogleCalendarNotConnectedError) {
      return NextResponse.json({ error: "Google Calendar não está conectado." }, { status: 409 });
    }
    return NextResponse.json({ error: "Não foi possível criar o evento agora. Tente novamente." }, { status: 502 });
  }
}
