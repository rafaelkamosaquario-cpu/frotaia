import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateCompany } from "@/services/supabase/companyService";

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

  try {
    const empresa = await updateCompany(supabase, access.company.id, access.userId, body);
    return NextResponse.json({ empresa });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isPermissionDenied(error)) {
      return NextResponse.json(
        { error: "Apenas proprietário ou administrador pode editar os dados da empresa." },
        { status: 403 }
      );
    }
    throw error;
  }
}

/**
 * .single() lança PGRST116 quando o UPDATE não afeta nenhuma linha — aqui
 * isso só acontece por RLS (companies_update_admin bloqueando
 * operator/viewer), nunca por "empresa não existe" (ela sempre existe,
 * veio de loadFleetPanelAccess).
 */
function isPermissionDenied(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
