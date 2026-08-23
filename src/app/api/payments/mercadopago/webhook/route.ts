import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMercadoPagoConfigured, getMercadoPagoWebhookSecret } from "@/lib/mercadopago/config";
import { validarAssinaturaWebhook, buscarPagamento, buscarAssinatura, decodificarReferenciaExterna } from "@/lib/mercadopago/client";
import { CATALOGO_OFERTAS } from "@/lib/mercadopago/catalog";
import {
  atualizarAssinaturaPorPagamento,
  registrarEventoPagamento,
  eventoPagamentoJaProcessado,
} from "@/services/supabase/subscriptionService";

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
    console.error("[mercadopago-webhook] MERCADOPAGO_WEBHOOK_SECRET não configurado — notificação rejeitada.");
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  const url = new URL(request.url);
  const dataIdQueryParam = url.searchParams.get("data.id");
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  const assinaturaValida = validarAssinaturaWebhook({ xSignature, xRequestId, dataIdQueryParam, secret });
  if (!assinaturaValida) {
    console.error("[mercadopago-webhook] assinatura HMAC inválida — notificação rejeitada.");
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
        await atualizarAssinaturaPorPagamento(admin, {
          companyId: referencia.companyId,
          plan: referencia.plano,
          status: "ATIVA",
          fleetPanelIncluded: CATALOGO_OFERTAS[referencia.plano].painel,
          valorCentavos: pagamento.valorCentavos,
          mercadopagoPaymentId: resourceId,
          validoAte: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });
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
      }
    }
  } catch (erro) {
    console.error("[mercadopago-webhook] falha processando notificação:", erro instanceof Error ? erro.message : JSON.stringify(erro));
    // Responde 200 mesmo assim: erro nosso (ex.: Supabase fora do ar) não deve fazer o
    // Mercado Pago reenviar em loop indefinido — o registro em payment_events (se chegou
    // a acontecer) e o log acima já dão o que precisa pra investigar depois.
  }

  return NextResponse.json({ ok: true });
}
