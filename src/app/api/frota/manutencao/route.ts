import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { createMaintenanceSchedule, listMaintenanceSchedulesForPanel } from "@/services/supabase/maintenanceScheduleService";
import { syncMaintenanceAlert } from "@/services/supabase/fleetAlertsService";
import { syncMaintenanceExpense } from "@/services/supabase/expenseService";
import { maintenanceCostSchema } from "@/lib/validation/schemas";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const manutencoes = await listMaintenanceSchedulesForPanel(supabase, access.company.id);
  return NextResponse.json({ manutencoes });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const manutencao = await createMaintenanceSchedule(supabase, access.company.id, body);
    // scheduled_alerts não tem RLS de escrita pra sessão de navegador (só client admin) — mesmo padrão de segurança já usado em toda a tabela.
    const admin = createAdminClient();
    await syncMaintenanceAlert(admin, access.company.id, access.userId, manutencao);

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

    return NextResponse.json({ manutencao, despesa }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    throw error;
  }
}
