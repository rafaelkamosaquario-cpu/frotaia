import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { updateMaintenanceSchedule } from "@/services/supabase/maintenanceScheduleService";
import { syncMaintenanceAlert } from "@/services/supabase/fleetAlertsService";
import { syncMaintenanceExpense } from "@/services/supabase/expenseService";
import { maintenanceCostSchema } from "@/lib/validation/schemas";

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
    const manutencao = await updateMaintenanceSchedule(supabase, id, access.company.id, body);
    const admin = createAdminClient();
    await syncMaintenanceAlert(admin, access.company.id, access.userId, manutencao);

    // Custo só é aceito ao concluir (nunca gravado em maintenance_schedules — vira/atualiza a despesa vinculada, nunca duplica).
    let despesa = null;
    if (manutencao.status === "concluido" && body && typeof body === "object" && "costAmount" in body && body.costAmount != null) {
      const custo = maintenanceCostSchema.parse(body.costAmount);
      despesa = await syncMaintenanceExpense(admin, {
        companyId: access.company.id,
        userId: access.userId,
        maintenanceScheduleId: manutencao.id,
        vehicleId: manutencao.vehicle_id,
        amount: custo,
        expenseDate: manutencao.executed_date ?? manutencao.due_date,
        description: `Manutenção: ${manutencao.type}`,
      });
    }

    return NextResponse.json({ manutencao, despesa });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Registro de manutenção não encontrado." }, { status: 404 });
    }
    throw error;
  }
}

/** .single() do Supabase lança PGRST116 quando o update não afeta nenhuma linha (id de outra empresa, ou inexistente). */
function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
