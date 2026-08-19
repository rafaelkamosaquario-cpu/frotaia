import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateRadar, setRadarStatus } from "@/services/supabase/freightRadarService";

const STATUS_VALIDOS = ["active", "paused", "cancelled"] as const;

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    if (typeof body.status === "string") {
      if (!STATUS_VALIDOS.includes(body.status)) {
        return NextResponse.json({ error: `status precisa ser um de: ${STATUS_VALIDOS.join(", ")}.` }, { status: 400 });
      }
      const radar = await setRadarStatus(supabase, id, access.company.id, access.userId, body.status);
      return NextResponse.json({ radar });
    }

    const radar = await updateRadar(supabase, id, access.company.id, access.userId, body);
    return NextResponse.json({ radar });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Radar não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
