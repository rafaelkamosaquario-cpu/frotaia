import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { createAlert, listAlertsForPanel, resolveAlertOrigin, type AlertOrigin } from "@/services/supabase/alertService";
import { alertCreateSchema } from "@/lib/validation/schemas";

/**
 * Alertas manuais pelo painel (Rodada 2, evolução funcional 08/2026) — usa o
 * client de SESSÃO do usuário (não admin): a RLS de escrita nova
 * (`scheduled_alerts_insert_operator`/`_update_operator`, migration
 * 20260824100000) só permite gravar quando `maintenance_schedule_id` e
 * `vehicle_document_id` são nulos, então um alerta criado por aqui nunca
 * pode colidir com a origem automática (manutenção/documento). Mesma
 * tabela e mesmos services que `gerenciar_alerta` (WhatsApp/IA) já usa.
 */

const ORIGENS_VALIDAS: AlertOrigin[] = ["manual", "manutencao", "documento", "checklist"];

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
  const status = url.searchParams.get("status");
  const origem = url.searchParams.get("origem");
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const vehicleId = url.searchParams.get("vehicleId") ?? undefined;

  const alertas = await listAlertsForPanel(supabase, {
    companyId: access.company.id,
    status: status as "pending" | "sent" | "cancelled" | "failed" | "resolved" | undefined,
    from,
    to,
    vehicleId,
  });

  const filtrados = origem && ORIGENS_VALIDAS.includes(origem as AlertOrigin) ? alertas.filter((a) => resolveAlertOrigin(a) === origem) : alertas;

  return NextResponse.json({ alertas: filtrados });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);
  if (!access.ok) {
    return NextResponse.json({ error: "Sem acesso ao painel de gestão de frota." }, { status: statusForAccessReason(access.reason) });
  }

  const body = await request.json().catch(() => null);

  try {
    const parsed = alertCreateSchema.parse(body);
    const alerta = await createAlert(supabase, {
      companyId: access.company.id,
      userId: access.userId,
      title: parsed.title,
      notes: parsed.notes,
      vehicleId: parsed.vehicleId ?? undefined,
      scheduledFor: parsed.scheduledFor,
    });
    return NextResponse.json({ alerta }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Dados inválidos.", detalhes: error.issues }, { status: 400 });
    }
    if (isPermissionError(error)) {
      return NextResponse.json({ error: "Só proprietário, administrador ou operador pode criar alertas." }, { status: 403 });
    }
    throw error;
  }
}

/** RLS nega o insert quando o papel não tem permissão — Postgres devolve código de policy violation. */
function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "42501";
}
