import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateVehicle } from "@/services/supabase/vehicleService";
import { MENSAGEM_LIMITE_VEICULOS_ATIVOS, isLimiteVeiculosAtivosError } from "@/lib/frota/vehicleApiErrors";

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
    const veiculo = await updateVehicle(supabase, id, access.company.id, access.userId, body);
    return NextResponse.json({ veiculo });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isLimiteVeiculosAtivosError(error)) {
      return NextResponse.json({ error: MENSAGEM_LIMITE_VEICULOS_ATIVOS }, { status: 409 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Veículo não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
