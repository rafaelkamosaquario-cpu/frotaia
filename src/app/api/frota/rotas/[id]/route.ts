import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateRoute, deactivateRoute } from "@/services/supabase/savedRouteService";

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
    // Mesmo endpoint serve edição de campos e "favoritar" (isFavorite: true) — savedRouteUpdateSchema já cobre o campo.
    const rota = await updateRoute(supabase, id, access.company.id, access.userId, body);
    return NextResponse.json({ rota });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
    }
    throw error;
  }
}

/** "Excluir" na tela sempre é soft delete (active=false) — arquitetura já é assim pra IA (gerenciar_rota_salva EXCLUIR), preserva histórico. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  try {
    const rota = await deactivateRoute(supabase, id, access.company.id, access.userId);
    return NextResponse.json({ rota });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
    }
    throw error;
  }
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
