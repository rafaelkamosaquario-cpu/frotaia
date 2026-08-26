import "server-only";
import { cancelarAssinatura, buscarAssinatura, classificarErroCancelamento } from "@/lib/mercadopago/client";
import {
  registrarTentativaCancelamentoPendente,
  resolverCancelamentoPendente,
  type PendingPreapprovalCancellation,
} from "@/services/supabase/subscriptionService";
import { logEvent, captureError } from "@/lib/observability/logger";
import type { SupabaseDbClient } from "@/services/supabase/types";

/**
 * Fechamento final do risco residual de cobrança dupla (08/2026). Orquestra
 * o cancelamento do preapproval ANTERIOR na troca de plano: chamado tanto
 * pelo webhook (primeira tentativa, sempre DEPOIS da nova assinatura já
 * confirmada ativa) quanto pelo job de reconciliação (retry das pendências).
 * Nunca lança — o chamador nunca deve deixar uma falha de cancelamento
 * derrubar a resposta do webhook nem desfazer a ativação do plano novo.
 *
 * Acima deste limite de tentativas por erro transitório (timeout/429/5xx),
 * desiste de tentar sozinho e marca "failed" — precisa de ação manual. Erro
 * permanente (400/401/403/404 — o Mercado Pago já disse que o pedido está
 * errado) marca "failed" na primeira tentativa, sem gastar retries à toa.
 */
const MAX_TENTATIVAS_CANCELAMENTO = 5;

function mensagemErroSegura(erro: unknown): string {
  // MercadoPagoApiError.message já é uma string fixa e segura (nunca inclui o corpo da resposta) — ver parseErrorSafely em client.ts.
  return erro instanceof Error ? erro.message : String(erro);
}

export type ResultadoCancelamento = "cancelado" | "ja_cancelado" | "pendente" | "falhou_definitivamente";

/**
 * Tenta cancelar `preapprovalId` uma vez e registra o resultado. `tentativasAnteriores`
 * vem de `PendingPreapprovalCancellation.attempts` quando já existir uma pendência
 * (retry via reconciliação); 0 na primeira tentativa (sempre o caso a partir do webhook).
 */
export async function cancelarComRecuperacao(
  admin: SupabaseDbClient,
  route: string,
  companyId: string,
  preapprovalId: string,
  tentativasAnteriores: number
): Promise<ResultadoCancelamento> {
  logEvent({ event: "previous_preapproval_cancel_requested", route, company_id: companyId, old_preapproval_id: preapprovalId, attempt: tentativasAnteriores + 1 });

  try {
    await cancelarAssinatura(preapprovalId);
    await resolverCancelamentoPendente(admin, companyId, preapprovalId);
    logEvent({ event: "previous_preapproval_cancelled", route, company_id: companyId, old_preapproval_id: preapprovalId });
    return "cancelado";
  } catch (erro) {
    const tentativas = tentativasAnteriores + 1;
    const permanente = classificarErroCancelamento(erro) === "permanente";
    const esgotou = tentativas >= MAX_TENTATIVAS_CANCELAMENTO;
    const status: "pending" | "failed" = permanente || esgotou ? "failed" : "pending";

    // Nunca perde o ID: mesmo se este `await` falhar (Supabase fora do ar), o erro
    // sobe pro chamador, que já é best-effort — mas o cenário normal é sempre persistir.
    await registrarTentativaCancelamentoPendente(admin, companyId, preapprovalId, status, mensagemErroSegura(erro));

    captureError({
      event: "previous_preapproval_cancel_failed",
      route,
      company_id: companyId,
      old_preapproval_id: preapprovalId,
      attempts: tentativas,
      requires_manual_action: status === "failed",
      error: erro,
    });

    return status === "failed" ? "falhou_definitivamente" : "pendente";
  }
}

/**
 * Chamado só pela reconciliação (nunca pelo webhook) — nunca confia só no
 * estado local: reconsulta o recurso real no Mercado Pago primeiro. Se já
 * estiver cancelado por qualquer via (inclusive ação manual direta no
 * painel do Mercado Pago), resolve sem reenviar outro cancelamento. Entradas
 * já marcadas "failed" (tentativas esgotadas/erro permanente) não são
 * reenviadas automaticamente — só a checagem de estado real roda de novo,
 * pra continuar detectando se alguém resolveu manualmente.
 */
export async function reconciliarCancelamentoPendente(
  admin: SupabaseDbClient,
  route: string,
  companyId: string,
  entry: PendingPreapprovalCancellation
): Promise<ResultadoCancelamento> {
  let assinatura: { status: string } | null = null;
  try {
    assinatura = await buscarAssinatura(entry.preapprovalId);
  } catch (erro) {
    captureError({
      event: "previous_preapproval_cancel_failed",
      route,
      company_id: companyId,
      old_preapproval_id: entry.preapprovalId,
      phase: "consulta_estado_real",
      error: erro,
    });
    return "pendente";
  }

  if (assinatura.status === "cancelled") {
    await resolverCancelamentoPendente(admin, companyId, entry.preapprovalId);
    logEvent({
      event: "previous_preapproval_cancelled",
      route,
      company_id: companyId,
      old_preapproval_id: entry.preapprovalId,
      via: "reconciliacao_detectou_ja_cancelado",
    });
    return "ja_cancelado";
  }

  if (entry.status === "failed") return "falhou_definitivamente";

  return cancelarComRecuperacao(admin, route, companyId, entry.preapprovalId, entry.attempts);
}
