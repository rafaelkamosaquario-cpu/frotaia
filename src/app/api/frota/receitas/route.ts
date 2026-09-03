import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listRevenues, recordRevenue } from "@/services/supabase/revenueService";
import { revenueCreateSchema } from "@/lib/validation/schemas";

/** Receitas — mesmo padrão de segurança de Despesas: `revenues` não tem RLS de escrita pra sessão de navegador (só client admin, mesma migration 20260903130000_create_revenues.sql). */
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
  const receitas = await listRevenues(supabase, {
    companyId: access.company.id,
    vehicleId: url.searchParams.get("vehicleId") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    limit: 200,
  });
  return NextResponse.json({ receitas });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const parsed = revenueCreateSchema.parse(body);
    const receita = await recordRevenue(createAdminClient(), {
      companyId: access.company.id,
      userId: access.userId,
      vehicleId: parsed.vehicleId ?? undefined,
      driverId: parsed.driverId ?? undefined,
      amount: parsed.amount,
      revenueDate: parsed.revenueDate,
      description: parsed.description,
    });
    return NextResponse.json({ receita }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    throw error;
  }
}
