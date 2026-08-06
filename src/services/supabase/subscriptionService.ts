import type { SubscriptionRow, SubscriptionPlanEnum, SubscriptionStatusEnum } from "@/lib/supabase/tables";
import type { Json } from "@/lib/supabase/database.types";
import type { SupabaseDbClient } from "./types";

/**
 * Fase 1 do fluxo de pagamento (Mercado Pago) — estado de assinatura por
 * empresa. `subscriptions` guarda o estado ATUAL (mesmo padrão de
 * company_preferences); `trial_usage` garante 1 teste grátis por número de
 * WhatsApp mesmo que a empresa seja excluída/recriada; `payment_events` é
 * log bruto de cada notificação recebida (webhook ainda não implementado —
 * ver Fase 2).
 */

const DIAS_TESTE_GRATIS = 7;

export async function getSubscription(client: SupabaseDbClient, companyId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await client.from("subscriptions").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data;
}

/** true se a empresa tem acesso liberado agora (assinatura ativa, ou teste dentro do prazo). */
export function isAccessAllowed(subscription: SubscriptionRow | null): boolean {
  if (!subscription) return false;
  if (subscription.status === "CANCELADA" || subscription.status === "EXPIRADA" || subscription.status === "INADIMPLENTE") return false;
  if (!subscription.valido_ate) return subscription.status === "ATIVA";
  return new Date(subscription.valido_ate).getTime() > Date.now();
}

export interface CriarTesteGratisResultado {
  subscription: SubscriptionRow;
  testeJaUsadoNesteNumero: boolean;
}

/**
 * Cria a assinatura TRIAL de uma empresa nova, checando primeiro se o
 * número de WhatsApp já usou o teste antes (trial_usage, chave = telefone,
 * sobrevive à exclusão da empresa anterior). Se já usou, cria a assinatura
 * já como EXPIRADA (sem novo período de teste) — quem chama decide como
 * comunicar isso ao cliente.
 */
export async function criarAssinaturaTeste(
  client: SupabaseDbClient,
  companyId: string,
  phoneE164: string
): Promise<CriarTesteGratisResultado> {
  const { data: usoAnterior, error: erroConsulta } = await client
    .from("trial_usage")
    .select("phone_e164")
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;

  const testeJaUsadoNesteNumero = !!usoAnterior;
  const agora = new Date();

  const { data: subscription, error: erroInsert } = await client
    .from("subscriptions")
    .insert({
      company_id: companyId,
      plan: "TRIAL",
      status: testeJaUsadoNesteNumero ? "EXPIRADA" : "TRIAL",
      trial_iniciado_em: agora.toISOString(),
      iniciado_em: agora.toISOString(),
      valido_ate: testeJaUsadoNesteNumero ? agora.toISOString() : new Date(agora.getTime() + DIAS_TESTE_GRATIS * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();
  if (erroInsert) throw erroInsert;

  if (!testeJaUsadoNesteNumero) {
    const { error: erroTrialUsage } = await client.from("trial_usage").insert({ phone_e164: phoneE164, company_id: companyId });
    if (erroTrialUsage) throw erroTrialUsage;
  }

  return { subscription, testeJaUsadoNesteNumero };
}

export interface AtualizarAssinaturaPorPagamentoInput {
  companyId: string;
  plan: SubscriptionPlanEnum;
  status: SubscriptionStatusEnum;
  valorCentavos?: number;
  mercadopagoSubscriptionId?: string;
  mercadopagoPaymentId?: string;
  validoAte?: string;
}

/** Usado pelo webhook do Mercado Pago (Fase 2) para refletir um pagamento confirmado. */
export async function atualizarAssinaturaPorPagamento(
  client: SupabaseDbClient,
  input: AtualizarAssinaturaPorPagamentoInput
): Promise<SubscriptionRow> {
  const { data, error } = await client
    .from("subscriptions")
    .update({
      plan: input.plan,
      status: input.status,
      valor_centavos: input.valorCentavos,
      mercadopago_subscription_id: input.mercadopagoSubscriptionId,
      mercadopago_payment_id: input.mercadopagoPaymentId,
      iniciado_em: new Date().toISOString(),
      valido_ate: input.validoAte,
    })
    .eq("company_id", input.companyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export interface RegistrarEventoPagamentoInput {
  companyId?: string;
  eventType: string;
  mercadopagoPaymentId?: string;
  statusRecebido?: string;
  payloadJson?: unknown;
}

/** Log bruto — nunca lança nem bloqueia o fluxo do webhook se falhar em gravar (best-effort, ver uso na Fase 2). */
export async function registrarEventoPagamento(client: SupabaseDbClient, input: RegistrarEventoPagamentoInput): Promise<void> {
  const { error } = await client.from("payment_events").insert({
    company_id: input.companyId,
    event_type: input.eventType,
    mercadopago_payment_id: input.mercadopagoPaymentId,
    status_recebido: input.statusRecebido,
    payload_json: (input.payloadJson ?? null) as Json,
  });
  if (error) throw error;
}
