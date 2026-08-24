import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getAlert, updateAlert, cancelAlert, isEditableAlert } from "@/services/supabase/alertService";
import { alertUpdateSchema } from "@/lib/validation/schemas";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

const MENSAGEM_ORIGEM_AUTOMATICA = "Este alerta é controlado automaticamente (manutenção ou documento) — edite a manutenção/documento de origem em vez do alerta.";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const alertaAtual = await getAlert(supabase, id, access.company.id);
  if (!alertaAtual) {
    return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
  }
  if (!isEditableAlert(alertaAtual)) {
    return NextResponse.json({ error: MENSAGEM_ORIGEM_AUTOMATICA }, { status: 409 });
  }

  const body = await request.json().catch(() => null);

  try {
    const parsed = alertUpdateSchema.parse(body);
    const alerta = await updateAlert(supabase, id, access.company.id, parsed);
    return NextResponse.json({ alerta });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

/** Cancelamento sempre por status (nunca DELETE físico) — preserva histórico, mesmo padrão já usado em Rotas/Manutenção. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const alertaAtual = await getAlert(supabase, id, access.company.id);
  if (!alertaAtual) {
    return NextResponse.json({ error: "Alerta não encontrado." }, { status: 404 });
  }
  if (!isEditableAlert(alertaAtual)) {
    return NextResponse.json({ error: MENSAGEM_ORIGEM_AUTOMATICA }, { status: 409 });
  }
  if (alertaAtual.status !== "pending") {
    return NextResponse.json({ error: "Só é possível cancelar um alerta ainda pendente." }, { status: 409 });
  }

  await cancelAlert(supabase, id, access.company.id);
  return NextResponse.json({ ok: true });
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha. */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
