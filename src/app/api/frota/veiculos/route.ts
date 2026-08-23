import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { createVehicle, listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { MENSAGEM_LIMITE_VEICULOS_ATIVOS, isLimiteVeiculosAtivosError } from "@/lib/frota/vehicleApiErrors";

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function GET() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const veiculos = await listVehiclesForPanel(supabase, access.company.id);
  return NextResponse.json({ veiculos });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();

  try {
    const veiculo = await createVehicle(supabase, access.company.id, access.userId, body);
    return NextResponse.json({ veiculo }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isLimiteVeiculosAtivosError(error)) {
      return NextResponse.json({ error: MENSAGEM_LIMITE_VEICULOS_ATIVOS }, { status: 409 });
    }
    throw error;
  }
}
