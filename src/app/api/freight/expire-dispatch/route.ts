import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { expireOverdueRadars } from "@/services/supabase/freightRadarService";
import { expireOverdueOpportunities } from "@/services/supabase/freightOpportunityService";
import { logDispatchStart, logDispatchEnd, captureError } from "@/lib/observability/logger";

const ROTA = "/api/freight/expire-dispatch";

/**
 * Radar de Fretes (MVP) — job de expiração (etapa 33 da spec): só marca
 * `status='expired'` em radares e oportunidades vencidos, nunca usa Claude
 * (etapa 33: "Não usar Claude no cron sem necessidade"). Mesmo padrão de
 * token dos outros 4 dispatches. O matching em si é orientado a evento (o
 * webhook chama processarNovaOportunidade direto), não por este cron — ver
 * etapa 34 ("evento é melhor que polling").
 * `curl -fsS "$APP_URL/api/freight/expire-dispatch?token=$FREIGHT_EXPIRE_DISPATCH_SECRET"`.
 */

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const secret = process.env.FREIGHT_EXPIRE_DISPATCH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "FREIGHT_EXPIRE_DISPATCH_SECRET não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, secret)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const startedAt = logDispatchStart(ROTA);
  const admin = createAdminClient();

  try {
    const radaresExpirados = await expireOverdueRadars(admin);
    const oportunidadesExpiradas = await expireOverdueOpportunities(admin);

    logDispatchEnd(ROTA, startedAt, { processados: radaresExpirados + oportunidadesExpiradas, sucesso: radaresExpirados + oportunidadesExpiradas, falha: 0 });
    return NextResponse.json({ ok: true, radaresExpirados, oportunidadesExpiradas });
  } catch (erro) {
    captureError({ event: "freight_expire_dispatch_falhou", route: ROTA, error: erro });
    logDispatchEnd(ROTA, startedAt, { processados: 0, sucesso: 0, falha: 1 });
    return NextResponse.json({ error: "Falha ao expirar radares/oportunidades." }, { status: 500 });
  }
}
