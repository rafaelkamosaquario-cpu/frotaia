import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateVehicleDocument } from "@/services/supabase/vehicleDocumentService";

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
    const documento = await updateVehicleDocument(supabase, id, access.company.id, body);
    return NextResponse.json({ documento });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
