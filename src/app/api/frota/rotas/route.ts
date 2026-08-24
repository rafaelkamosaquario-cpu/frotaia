import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRoutes, createRoute } from "@/services/supabase/savedRouteService";

/**
 * Rotas — CRUD no painel (evolução funcional 08/2026, antes só leitura). A
 * RLS de `saved_routes` já permite insert/update/delete via sessão de
 * usuário autenticado (owner/admin/operator) — confirmado na migration
 * `20260726235723_create_rls_policies.sql` — então usa o client de sessão
 * normal (`createClient()`), nunca o admin. Mesmos services já usados pela
 * ferramenta de IA (`gerenciar_rota_salva`), garantindo painel e WhatsApp
 * sempre lendo/escrevendo a mesma fonte de dado.
 */

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const rotas = await listRoutes(supabase, access.company.id);
  return NextResponse.json({ rotas });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const rota = await createRoute(supabase, access.company.id, access.userId, body);
    return NextResponse.json({ rota }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isPermissionError(error)) {
      return NextResponse.json({ error: "Só proprietário, administrador ou operador pode cadastrar rotas." }, { status: 403 });
    }
    throw error;
  }
}

/** RLS nega o insert/update (nenhuma linha afetada) quando o papel não tem permissão — Postgres devolve erro de policy, não PGRST116 (que é só pra update/single sem match). */
function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "42501";
}
