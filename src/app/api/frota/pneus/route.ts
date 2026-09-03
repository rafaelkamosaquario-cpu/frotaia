import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehicleTires, createVehicleTire } from "@/services/supabase/vehicleTireService";
import { syncTireAlert } from "@/services/supabase/fleetAlertsService";

/**
 * Pneus — CRUD no painel. `vehicle_tires` tem RLS de escrita pra sessão de
 * usuário (owner/admin/operator, migration
 * `20260903120000_create_vehicle_tires.sql`), então cria/atualiza com o
 * client de sessão; `scheduled_alerts` (sem RLS de escrita — mesmo padrão
 * de gerenciar_manutencao) usa o client admin só pra sincronizar o alerta
 * de km baixo. Mesmos services já usados pela ferramenta de IA
 * (`gerenciar_pneu_veiculo`), garantindo painel e WhatsApp sempre
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
  const pneus = await listVehicleTires(supabase, {
    companyId: access.company.id,
    vehicleId: url.searchParams.get("vehicleId") ?? undefined,
  });
  return NextResponse.json({ pneus });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const pneu = await createVehicleTire(supabase, access.company.id, access.userId, body);
    await syncTireAlert(createAdminClient(), access.company.id, access.userId, pneu);
    return NextResponse.json({ pneu }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isPermissionError(error)) {
      return NextResponse.json({ error: "Só proprietário, administrador ou operador pode cadastrar pneus." }, { status: 403 });
    }
    if (isCheckViolation(error)) {
      return NextResponse.json({ error: "Um pneu 'montado' precisa de um veículo vinculado." }, { status: 400 });
    }
    throw error;
  }
}

/** RLS nega o insert/update (nenhuma linha afetada) quando o papel não tem permissão — Postgres devolve erro de policy, não PGRST116 (que é só pra update/single sem match). */
function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "42501";
}

/** vehicle_tires_montado_requires_vehicle — status='montado' sem vehicle_id. */
function isCheckViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23514";
}
