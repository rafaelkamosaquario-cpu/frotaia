import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateFuelFillup, deleteFuelFillup } from "@/services/supabase/fuelFillupService";
import { syncFuelExpense } from "@/services/supabase/expenseService";

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
    const abastecimento = await updateFuelFillup(supabase, id, access.company.id, access.userId, body);

    const despesa = await syncFuelExpense(createAdminClient(), {
      companyId: access.company.id,
      userId: access.userId,
      fuelFillupId: abastecimento.id,
      vehicleId: abastecimento.vehicle_id,
      amount: Number(abastecimento.total_amount),
      expenseDate: abastecimento.fillup_date,
      description: `Abastecimento (${abastecimento.liters}L)`,
    });

    return NextResponse.json({ abastecimento, despesa });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Abastecimento não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

/** Hard delete (mesmo padrão da ferramenta de IA) — a despesa vinculada, se houver, não é apagada junto (expenses.fuel_fillup_id vira null, preserva histórico financeiro). */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  await deleteFuelFillup(supabase, id, access.company.id);
  return NextResponse.json({ ok: true });
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
