import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listFuelFillups, createFuelFillup, computeAverageFuelConsumption } from "@/services/supabase/fuelFillupService";
import { syncFuelExpense } from "@/services/supabase/expenseService";

/**
 * Abastecimentos — CRUD no painel. `fuel_fillups` tem RLS de escrita pra
 * sessão de usuário (owner/admin/operator, migration
 * `20260903110000_create_fuel_fillups.sql`), então cria/atualiza com o
 * client de sessão; `expenses` (legado, sem RLS de escrita — mesmo padrão
 * de gerenciar_manutencao) usa o client admin só pra sincronizar a despesa
 * vinculada. Mesmos services já usados pela ferramenta de IA
 * (`gerenciar_abastecimento`), garantindo painel e WhatsApp sempre
 * lendo/escrevendo a mesma fonte de dado.
 */

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
  const vehicleId = url.searchParams.get("vehicleId") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;

  const abastecimentos = await listFuelFillups(supabase, { companyId: access.company.id, vehicleId, dateFrom, dateTo, limit: 200 });

  // Consumo médio real só faz sentido filtrado por 1 veículo — mesmo cálculo usado por gerenciar_abastecimento (CONSULTAR_CONSUMO_MEDIO), única fonte de verdade.
  const consumoMedio = vehicleId ? await computeAverageFuelConsumption(supabase, access.company.id, vehicleId, dateFrom, dateTo) : null;

  return NextResponse.json({ abastecimentos, consumoMedio });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const abastecimento = await createFuelFillup(supabase, access.company.id, access.userId, body);

    const despesa = await syncFuelExpense(createAdminClient(), {
      companyId: access.company.id,
      userId: access.userId,
      fuelFillupId: abastecimento.id,
      vehicleId: abastecimento.vehicle_id,
      amount: Number(abastecimento.total_amount),
      expenseDate: abastecimento.fillup_date,
      description: `Abastecimento (${abastecimento.liters}L)`,
    });

    return NextResponse.json({ abastecimento, despesa }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isPermissionError(error)) {
      return NextResponse.json({ error: "Só proprietário, administrador ou operador pode registrar abastecimentos." }, { status: 403 });
    }
    throw error;
  }
}

/** RLS nega o insert/update (nenhuma linha afetada) quando o papel não tem permissão — Postgres devolve erro de policy, não PGRST116 (que é só pra update/single sem match). */
function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "42501";
}
