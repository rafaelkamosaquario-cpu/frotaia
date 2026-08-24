import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getMatch, updateMatchStatus } from "@/services/supabase/freightMatchService";
import { getOpportunity } from "@/services/supabase/freightOpportunityService";
import { getVehicle } from "@/services/supabase/vehicleService";
import { listRadarsForCompany } from "@/services/supabase/freightRadarService";
import { analisarOportunidadeParaMatch } from "@/services/freight/radarMatchingEngine";

const STATUS_VALIDOS = ["viewed", "favorited", "ignored"] as const;

function statusForAccessReason(reason: "unauthenticated" | "no_company" | "not_entitled") {
  return reason === "unauthenticated" ? 401 : 403;
}

/** PATCH { status } para favoritar/ignorar/marcar como visto, ou { acao: "analisar" } — mesma pré-análise reaproveitada pela ferramenta de IA (analisarOportunidadeParaMatch), nunca um segundo cálculo. */
export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await context.params;
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json();
  const admin = createAdminClient();

  if (body.acao === "analisar") {
    const match = await getMatch(supabase, matchId, access.company.id);
    if (!match) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
    if (!match.vehicle_id) return NextResponse.json({ error: "Este radar não tem veículo associado." }, { status: 422 });

    const [oportunidade, veiculo, radares] = await Promise.all([
      getOpportunity(admin, match.opportunity_id),
      getVehicle(admin, match.vehicle_id),
      listRadarsForCompany(admin, access.company.id),
    ]);
    const radar = radares.find((r) => r.id === match.radar_id);
    if (!oportunidade || !veiculo || !radar) return NextResponse.json({ error: "Dados incompletos para análise." }, { status: 422 });

    const preAnalise = await analisarOportunidadeParaMatch(admin, match.id, access.company.id, oportunidade, radar, veiculo);
    const matchAtualizado = await getMatch(supabase, matchId, access.company.id);
    return NextResponse.json({ match: matchAtualizado, preAnalise });
  }

  if (typeof body.status !== "string" || !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: `status precisa ser um de: ${STATUS_VALIDOS.join(", ")}.` }, { status: 400 });
  }

  try {
    const match = await updateMatchStatus(supabase, matchId, access.company.id, body.status);
    return NextResponse.json({ match });
  } catch (error) {
    if (isNotFoundError(error)) {
      return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "PGRST116";
}
