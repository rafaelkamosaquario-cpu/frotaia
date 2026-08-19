import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { setSourceEnabled } from "@/services/supabase/freightSourceService";

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
  if (access.role !== "owner" && access.role !== "admin") {
    return NextResponse.json({ error: "Só o dono/administrador da empresa pode gerenciar fontes autorizadas." }, { status: 403 });
  }

  const body = await request.json();
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) é obrigatório." }, { status: 400 });
  }

  try {
    const fonte = await setSourceEnabled(supabase, id, access.company.id, body.enabled);
    return NextResponse.json({ fonte });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Fonte não encontrada." }, { status: 404 });
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
