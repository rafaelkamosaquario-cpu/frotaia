import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateVehicleTire } from "@/services/supabase/vehicleTireService";
import { syncTireAlert } from "@/services/supabase/fleetAlertsService";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

/** Cobre edição de campos, ATUALIZAR_KM (só lastCheckedKm) e DESMONTAR (status/removedAt/removalReason) — mesmo endpoint, schema de update já cobre todos os campos. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const pneu = await updateVehicleTire(supabase, id, access.company.id, access.userId, body);
    await syncTireAlert(createAdminClient(), access.company.id, access.userId, pneu);
    return NextResponse.json({ pneu });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Pneu não encontrado." }, { status: 404 });
    }
    if (isCheckViolation(error)) {
      return NextResponse.json({ error: "Um pneu 'montado' precisa de um veículo vinculado." }, { status: 400 });
    }
    throw error;
  }
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}

/** vehicle_tires_montado_requires_vehicle — status='montado' sem vehicle_id. */
function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23514";
}
