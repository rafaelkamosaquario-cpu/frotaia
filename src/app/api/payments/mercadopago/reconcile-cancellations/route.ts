import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarAssinaturasComCancelamentoPendente } from "@/services/supabase/subscriptionService";
import { reconciliarCancelamentoPendente } from "@/services/mercadopago/cancelamentoAssinaturaAnterior";
import { logDispatchStart, logDispatchEnd, logEvent, captureError } from "@/lib/observability/logger";

const ROTA = "/api/payments/mercadopago/reconcile-cancellations";

/**
 * Fechamento final do risco residual de cobrança dupla (08/2026) — mesmo
 * padrão de token dos outros dispatches. Não precisa rodar a cada minuto
 * (pendência só existe entre uma falha de cancelamento e a próxima
 * execução deste job): 1x por hora, mesmo intervalo do
 * `/api/freight/expire-dispatch`. Idempotente: rodar 2x seguidas (ou 2
 * instâncias ao mesmo tempo) é seguro — `reconciliarCancelamentoPendente`
 * sempre reconsulta o estado real no Mercado Pago antes de decidir, e a
 * trava de linha dentro de `upsert_pending_preapproval_cancellation`/
 * `resolve_pending_preapproval_cancellation` (migration
 * 20260826140000) evita perder uma entrada em caso de execução concorrente.
 * `curl -fsS "$APP_URL/api/payments/mercadopago/reconcile-cancellations?token=$SUBSCRIPTION_CANCEL_RECONCILE_SECRET"`.
 */

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const secret = process.env.SUBSCRIPTION_CANCEL_RECONCILE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SUBSCRIPTION_CANCEL_RECONCILE_SECRET não configurado." }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, secret)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  const startedAt = logDispatchStart(ROTA);
  const admin = createAdminClient();
  logEvent({ event: "previous_preapproval_reconciliation_started", route: ROTA });

  const assinaturas = await listarAssinaturasComCancelamentoPendente(admin);

  let processados = 0;
  let sucesso = 0;
  let falha = 0;

  for (const assinatura of assinaturas) {
    const pendencias = (assinatura.pending_preapproval_cancellations ?? []) as unknown as Array<{
      preapprovalId: string;
      status: "pending" | "failed";
      attempts: number;
      lastAttemptAt: string;
      lastError: string | null;
    }>;

    for (const pendencia of pendencias) {
      processados += 1;
      try {
        const resultado = await reconciliarCancelamentoPendente(admin, ROTA, assinatura.company_id, pendencia);
        if (resultado === "cancelado" || resultado === "ja_cancelado") sucesso += 1;
      } catch (erro) {
        falha += 1;
        captureError({
          event: "previous_preapproval_cancel_failed",
          route: ROTA,
          company_id: assinatura.company_id,
          old_preapproval_id: pendencia.preapprovalId,
          phase: "reconciliacao",
          error: erro,
        });
      }
    }
  }

  logDispatchEnd(ROTA, startedAt, { processados, sucesso, falha });
  logEvent({ event: "previous_preapproval_reconciliation_completed", route: ROTA, empresas: assinaturas.length, processados, sucesso, falha });

  return NextResponse.json({ ok: true, empresas: assinaturas.length, processados, sucesso, falha });
}
