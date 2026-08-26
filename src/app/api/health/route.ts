import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability/logger";

/**
 * Health check (prontidão de produção, 08/2026) — pra uso do healthcheckPath
 * do Railway e checagem manual. De propósito NÃO chama Anthropic nem Z-API
 * (nunca gasta chamada paga nem manda mensagem só por causa de um health
 * check) — só confirma que o processo está de pé e que o banco responde a
 * uma consulta mínima. Sem secrets na resposta.
 */

const ROTA = "/api/health";

export async function GET() {
  const startedAt = Date.now();

  let database: "ok" | "erro" = "ok";
  try {
    const admin = createAdminClient();
    // HEAD + count: não baixa nenhuma linha, só confirma que a conexão/consulta funciona.
    const { error } = await admin.from("companies").select("id", { count: "exact", head: true });
    if (error) throw error;
  } catch (erro) {
    database = "erro";
    captureError({ event: "health_check_banco_falhou", route: ROTA, error: erro });
  }

  const status = database === "ok" ? "ok" : "degraded";
  const corpo = {
    status,
    service: "frota-ia-assistente",
    timestamp: new Date().toISOString(),
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    database,
    duration_ms: Date.now() - startedAt,
  };

  return NextResponse.json(corpo, { status: status === "ok" ? 200 : 503 });
}
