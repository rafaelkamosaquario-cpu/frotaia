import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMercadoPagoConfigured, getMercadoPagoWebhookSecret } from "@/lib/mercadopago/config";
import { validarAssinaturaWebhook, buscarPagamento, buscarAssinatura, decodificarReferenciaExterna } from "@/lib/mercadopago/client";
import { CATALOGO_OFERTAS } from "@/lib/mercadopago/catalog";
import {
  atualizarAssinaturaPorPagamento,
  registrarEventoPagamento,
  eventoPagamentoJaProcessado,
  getSubscription,
} from "@/services/supabase/subscriptionService";
import { cancelarComRecuperacao } from "@/services/mercadopago/cancelamentoAssinaturaAnterior";
import { captureError, logEvent } from "@/lib/observability/logger";
import type { SupabaseDbClient } from "@/services/supabase/types";

const ROTA = "/api/payments/mercadopago/webhook";

/**
 * Troca de plano (fechamento 08/2026, com correção final do risco residual
 * em 08/2026) — antes NENHUM código cancelava a assinatura recorrente
 * anterior no Mercado Pago ao trocar de plano (ex.: Individual → Gestão
 * Mensal), e o próprio `mercadopago_subscription_id` antigo era
 * sobrescrito pelo novo antes de qualquer cancelamento ser possível —
 * risco real de cobrança dupla. Depois, o cancelamento em si passou a
 * existir mas era best-effort SEM persistência: se falhasse, o ID antigo
 * se perdia. Agora `cancelarComRecuperacao` persiste toda tentativa (via
 * `src/services/mercadopago/cancelamentoAssinaturaAnterior.ts`) e o job de
 * reconciliação (`/api/payments/mercadopago/reconcile-cancellations`)
 * garante que nenhuma pendência fica invisível pra sempre.
 *
 * Ordem de segurança (nunca a inversa): SEMPRE chamado DEPOIS que a nova
 * assinatura já está confirmada ATIVA no banco — o cliente nunca fica sem
 * acesso entre as duas etapas. Só cancela quando `mercadopago_subscription_id`
 * antigo existir E for DIFERENTE do recurso que acabou de ser processado
 * (evita cancelar a própria assinatura que só mudou de status, ex.:
 * pending→authorized). Nunca lança — se o cancelamento falhar (mesmo depois
 * das tentativas), a nova assinatura já está ativa (o essencial pro
 * cliente) e a pendência fica registrada e recuperável.
 */
async function cancelarAssinaturaAnteriorSeTrocouDePlano(
  admin: SupabaseDbClient,
  companyId: string,
  oldPreapprovalId: string | null | undefined,
  novoResourceId: string
): Promise<void> {
  if (!oldPreapprovalId || oldPreapprovalId === novoResourceId) return;

  logEvent({
    event: "subscription_upgrade_started",
    route: ROTA,
    company_id: companyId,
    old_preapproval_id: oldPreapprovalId,
    new_resource_id: novoResourceId,
  });

  await cancelarComRecuperacao(admin, ROTA, companyId, oldPreapprovalId, 0);
}

/**
 * Webhook do Mercado Pago (Fase 2 do fluxo de pagamento). Nunca confia no
 * corpo da notificação por si só — sempre reconsulta o recurso (pagamento
 * ou assinatura) na API do Mercado Pago antes de liberar/alterar acesso, e
 * valida a assinatura HMAC (`x-signature`) antes de processar qualquer
 * coisa. Configuração necessária no painel: Suas integrações > Webhooks >
 * Configurar notificação, URL = "${APP_URL}/api/payments/mercadopago/webhook",
 * eventos "Pagamentos" e "Assinaturas" — o segredo revelado ali vira a
 * variável MERCADOPAGO_WEBHOOK_SECRET no Railway.
 *
 * Responde 200 mesmo quando não há nada a processar (tipo desconhecido,
 * pagamento não aprovado) — o Mercado Pago espera 200/201 em até 22s pra
 * não reenviar a notificação; um 4xx/5xx só é usado quando a notificação em
 * si é inválida (assinatura errada) ou o servidor não está configurado.
 */

const TIPOS_ASSINATURA = new Set(["preapproval", "subscription_preapproval"]);

const STATUS_ASSINATURA_MAP: Record<string, "ATIVA" | "CANCELADA" | "INADIMPLENTE" | null> = {
  authorized: "ATIVA",
  cancelled: "CANCELADA",
  paused: "INADIMPLENTE",
};

export async function POST(request: Request) {
  if (!isMercadoPagoConfigured()) {
    return NextResponse.json({ error: "Mercado Pago não configurado." }, { status: 503 });
  }

  const secret = getMercadoPagoWebhookSecret();
  if (!secret) {
    captureError({ event: "mercadopago_webhook_sem_secret", route: ROTA, error: new Error("MERCADOPAGO_WEBHOOK_SECRET não configurado") });
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const url = new URL(request.url);
  const dataIdQueryParam = url.searchParams.get("data.id");
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  const assinaturaValida = validarAssinaturaWebhook({ xSignature, xRequestId, dataIdQueryParam, secret });
  if (!assinaturaValida) {
    // Nunca loga x-signature/segredo — só o fato de ter sido rejeitada.
    captureError({ event: "mercadopago_assinatura_invalida", route: ROTA, error: new Error("HMAC do webhook do Mercado Pago não bateu") });
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { type?: string; data?: { id?: string } } | null;
  const tipo = body?.type ?? url.searchParams.get("type") ?? "";
  const resourceId = dataIdQueryParam ?? body?.data?.id ?? null;

  if (!resourceId) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  try {
    if (tipo === "payment") {
      const pagamento = await buscarPagamento(resourceId);
      const referencia = pagamento.externalReference ? decodificarReferenciaExterna(pagamento.externalReference) : null;

      // Idempotência: mesma notificação (mesmo pagamento + mesmo status) já
      // processada antes — registra de novo pra rastreabilidade (sempre
      // best-effort), mas não reaplica a assinatura (evita empurrar
      // valido_ate mais 365 dias a cada reentrega do mesmo webhook).
      const jaProcessado = await eventoPagamentoJaProcessado(admin, resourceId, pagamento.status);

      await registrarEventoPagamento(admin, {
        companyId: referencia?.companyId,
        eventType: "payment",
        mercadopagoPaymentId: resourceId,
        statusRecebido: pagamento.status,
        payloadJson: body,
      });

      // Planos de cobrança única (Gestão Anual cartão/Pix) — planos
      // recorrentes (MENSAL/GESTAO_MENSAL) são tratados só pelo evento de
      // assinatura (preapproval) abaixo, nunca por aqui.
      if (
        referencia &&
        !jaProcessado &&
        pagamento.status === "approved" &&
        CATALOGO_OFERTAS[referencia.plano].cobranca === "unica"
      ) {
        // Captura o preapproval ANTES de sobrescrever — só ele sabe se
        // existia uma assinatura recorrente ativa (ex.: veio do MENSAL ou
        // GESTAO_MENSAL) que agora precisa ser cancelada no MP.
        const assinaturaAnterior = await getSubscription(admin, referencia.companyId);
        const preapprovalAnterior = assinaturaAnterior?.mercadopago_subscription_id;

        await atualizarAssinaturaPorPagamento(admin, {
          companyId: referencia.companyId,
          plan: referencia.plano,
          status: "ATIVA",
          fleetPanelIncluded: CATALOGO_OFERTAS[referencia.plano].painel,
          valorCentavos: pagamento.valorCentavos,
          mercadopagoPaymentId: resourceId,
          validoAte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

        // Só depois da nova assinatura já confirmada ATIVA no banco.
        await cancelarAssinaturaAnteriorSeTrocouDePlano(admin, referencia.companyId, preapprovalAnterior, resourceId);
      }
    } else if (TIPOS_ASSINATURA.has(tipo)) {
      const assinatura = await buscarAssinatura(resourceId);
      const referencia = assinatura.externalReference ? decodificarReferenciaExterna(assinatura.externalReference) : null;
      const statusMapeado = STATUS_ASSINATURA_MAP[assinatura.status] ?? null;

      const jaProcessado = await eventoPagamentoJaProcessado(admin, resourceId, assinatura.status);

      await registrarEventoPagamento(admin, {
        companyId: referencia?.companyId,
        eventType: tipo,
        mercadopagoPaymentId: resourceId,
        statusRecebido: assinatura.status,
        payloadJson: body,
      });

      // Antes gravava plan:"MENSAL" fixo, ignorando o plano real do
      // external_reference — corrigido pra suportar GESTAO_MENSAL também
      // (senão o upsell nunca resultaria em entitlement de painel correto).
      if (referencia && !jaProcessado && statusMapeado) {
        // Captura o preapproval ANTERIOR antes de sobrescrever — só assim
        // dá pra saber depois se existia uma assinatura recorrente diferente
        // desta (troca de plano real) que precisa ser cancelada no MP.
        const assinaturaAnterior = statusMapeado === "ATIVA" ? await getSubscription(admin, referencia.companyId) : null;
        const preapprovalAnterior = assinaturaAnterior?.mercadopago_subscription_id;

        await atualizarAssinaturaPorPagamento(admin, {
          companyId: referencia.companyId,
          plan: referencia.plano,
          status: statusMapeado,
          fleetPanelIncluded: statusMapeado === "ATIVA" ? CATALOGO_OFERTAS[referencia.plano].painel : false,
          mercadopagoSubscriptionId: resourceId,
          // Ao ativar um plano recorrente, limpa validade residual do TRIAL
          // (criarAssinaturaTeste grava valido_ate = +7 dias) — sem isso,
          // isAccessAllowed cai no ramo de comparação de data e bloqueia o
          // cliente pago ~7 dias após o cadastro original, mesmo com a
          // assinatura ATIVA. Planos recorrentes não usam valido_ate como
          // controle de expiração (isso é exclusivo dos planos anuais).
          validoAte: statusMapeado === "ATIVA" ? null : undefined,
        });

        // Só quando o novo preapproval ficou ATIVA de verdade, e só depois
        // de já estar confirmado no banco — nunca cancela a anterior por
        // causa de um evento "pending"/"paused" desta mesma troca.
        if (statusMapeado === "ATIVA") {
          await cancelarAssinaturaAnteriorSeTrocouDePlano(admin, referencia.companyId, preapprovalAnterior, resourceId);
        }
      }
    }
  } catch (erro) {
    // Nunca passa `body` (payload bruto do MP, pode conter dado de pagador) pro tracker — só IDs técnicos e a mensagem do erro (buscarPagamento/buscarAssinatura já nunca incluem o corpo da resposta na mensagem, ver parseErrorSafely em client.ts).
    captureError({ event: "mercadopago_webhook_falhou", route: ROTA, resource_id: resourceId, tipo, error: erro });
    // Responde 200 mesmo assim: erro nosso (ex.: Supabase fora do ar) não deve fazer o
    // Mercado Pago reenviar em loop indefinido — o registro em payment_events (se chegou
    // a acontecer) e o evento acima já dão o que precisa pra investigar depois.
  }

  return NextResponse.json({ ok: true });
}
