import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { createSource, listSourcesForCompany } from "@/services/supabase/freightSourceService";
import { isUniqueViolation } from "@/lib/supabase/errors";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

/**
 * Fontes PRIVADAS da empresa (grupo de WhatsApp autorizado a alimentar o
 * Radar desta empresa). Fontes GLOBAIS (company_id nulo, servem várias
 * empresas) não aparecem aqui — são cadastradas só pelo backend, sem UI.
 */
export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const fontes = await listSourcesForCompany(supabase, access.company.id);
  return NextResponse.json({ fontes });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }
  if (access.role !== "owner" && access.role !== "admin") {
    return NextResponse.json({ error: "Só o dono/administrador da empresa pode gerenciar fontes autorizadas." }, { status: 403 });
  }

  const body = await request.json();
  if (typeof body.groupExternalId !== "string" || !body.groupExternalId.trim()) {
    return NextResponse.json({ error: "groupExternalId é obrigatório (id do grupo no Z-API, campo \"phone\" do webhook)." }, { status: 400 });
  }

  try {
    const fonte = await createSource(supabase, access.company.id, access.userId, body.groupExternalId.trim(), body.groupName ?? null);
    return NextResponse.json({ fonte }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "Esse grupo já está cadastrado." }, { status: 409 });
    }
    throw error;
  }
}
