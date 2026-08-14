import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listExpenses, recordExpense } from "@/services/supabase/expenseService";
import { expenseCreateSchema } from "@/lib/validation/schemas";
import type { ExpenseTypeEnum } from "@/lib/supabase/tables";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const url = new URL(request.url);
  const despesas = await listExpenses(supabase, {
    companyId: access.company.id,
    vehicleId: url.searchParams.get("vehicleId") ?? undefined,
    expenseType: (url.searchParams.get("expenseType") as ExpenseTypeEnum | null) ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    limit: 200,
  });
  return NextResponse.json({ despesas });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const parsed = expenseCreateSchema.parse(body);
    // expenses não tem RLS de escrita pra sessão de navegador (só client admin) — mesmo padrão de segurança já usado em scheduled_alerts.
    const despesa = await recordExpense(createAdminClient(), {
      companyId: access.company.id,
      userId: access.userId,
      vehicleId: parsed.vehicleId ?? undefined,
      expenseType: parsed.expenseType,
      amount: parsed.amount,
      expenseDate: parsed.expenseDate,
      vendor: parsed.vendor,
      description: parsed.description,
    });
    return NextResponse.json({ despesa }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    throw error;
  }
}
