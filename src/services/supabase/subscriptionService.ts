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
  if (!data) return null;
  return corrigirStatusExpiradoSeNecessario(client, data);
}

/**
 * Fechamento de coerência (08/2026): um plano ANUAL vencido ficava com
 * `status="ATIVA"` e `valido_ate` no passado pra sempre — `isAccessAllowed`
 * já bloqueava certo (compara a data), mas o status em si ficava
 * semanticamente incoerente (dizia "ativa" pra uma assinatura vencida).
 * Correção REATIVA, nunca um cron novo: na primeira leitura depois do
 * vencimento, corrige `status` pra `EXPIRADA` — se renovar depois, o
 * webhook já volta a gravar `ATIVA` normalmente (mesmo fluxo de sempre).
 * Nunca mexe em plano recorrente (`valido_ate=null` é o estado normal de
 * um plano ATIVA recorrente, nunca "vencido").
 */
async function corrigirStatusExpiradoSeNecessario(client: SupabaseDbClient, subscription: SubscriptionRow): Promise<SubscriptionRow> {
  const venceu = subscription.status === "ATIVA" && !!subscription.valido_ate && new Date(subscription.valido_ate).getTime() <= Date.now();
  if (!venceu) return subscription;

  const { data: atualizado, error } = await client
    .from("subscriptions")
    .update({ status: "EXPIRADA" })
    .eq("company_id", subscription.company_id)
    .eq("status", "ATIVA") // compare-and-swap simples — nunca sobrescreve uma mudança concorrente (ex.: renovação processada entre a leitura e aqui)
    .select("*")
    .maybeSingle();

  // Falha ao corrigir nunca quebra a leitura — isAccessAllowed já bloqueia certo pela data de qualquer forma.
  return error || !atualizado ? subscription : atualizado;
}

/** true se a empresa tem acesso liberado agora (assinatura ativa, ou teste dentro do prazo). */
export function isAccessAllowed(subscription: SubscriptionRow | null): boolean {
  if (!subscription) return false;
  if (subscription.status === "CANCELADA" || subscription.status === "EXPIRADA" || subscription.status === "INADIMPLENTE") return false;
  if (!subscription.valido_ate) return subscription.status === "ATIVA";
  return new Date(subscription.valido_ate).getTime() > Date.now();
}

/**
 * Espelha isAccessAllowed, mas também exige fleet_panel_included=true —
 * plano de unificação V1+V2, Fase 15. Entitlement do painel V2 é uma
 * dimensão própria (o que o plano inclui), ortogonal a `plan` (cadência de
 * cobrança): uma assinatura ATIVA/dentro do prazo sem fleet_panel_included
 * não libera o painel. Preço/plano da V2 continuam não definidos — este
 * campo é setado manualmente até existir checkout real.
 */
export function isFleetPanelAccessAllowed(subscription: SubscriptionRow | null): boolean {
  if (!subscription || !subscription.fleet_panel_included) return false;
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

/**
 * Assinaturas em TRIAL que precisam de aviso (dia 5 ou último dia) e ainda
 * não foram avisadas desse tipo — usado pelo job de disparo diário. Um
 * mesmo registro pode aparecer aqui precisando dos dois avisos ao mesmo
 * tempo (ex.: cron ficou fora do ar alguns dias); quem chama decide qual(is)
 * mandar, recalculando as datas por registro.
 */
export async function listarTestesParaAvisar(client: SupabaseDbClient, limit = 200): Promise<SubscriptionRow[]> {
  const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const em24Horas = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("status", "TRIAL")
    .or(`and(trial_avisado_dia5.eq.false,trial_iniciado_em.lte.${cincoDiasAtras}),and(trial_avisado_ultimo_dia.eq.false,valido_ate.lte.${em24Horas})`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function marcarAvisoTrialEnviado(client: SupabaseDbClient, companyId: string, tipo: "dia5" | "ultimoDia"): Promise<void> {
  const update = tipo === "dia5" ? { trial_avisado_dia5: true } : { trial_avisado_ultimo_dia: true };
  const { error } = await client.from("subscriptions").update(update).eq("company_id", companyId);
  if (error) throw error;
}

export interface AtualizarAssinaturaPorPagamentoInput {
  companyId: string;
  plan: SubscriptionPlanEnum;
  status: SubscriptionStatusEnum;
  /** Entitlement do Painel de Gestão que este plano concede — resolvido pelo chamador a partir de CATALOGO_OFERTAS (src/lib/mercadopago/catalog.ts), nunca lido do payload do Mercado Pago. Grava sempre (nunca deixa o campo intocado), pra downgrade de plano também revogar o painel corretamente. */
  fleetPanelIncluded: boolean;
  valorCentavos?: number;
  mercadopagoSubscriptionId?: string;
  mercadopagoPaymentId?: string;
  /** string = define validade explícita (planos anuais); null = limpa validade residual (ex.: trial→recorrente ATIVA); undefined = não mexe no campo. */
  validoAte?: string | null;
}

/** Usado pelo webhook do Mercado Pago pra refletir um pagamento confirmado — inclui o entitlement do Painel de Gestão (08/2026, nova estrutura comercial), que antes desta mudança nunca era gravado aqui. */
export async function atualizarAssinaturaPorPagamento(
  client: SupabaseDbClient,
  input: AtualizarAssinaturaPorPagamentoInput
): Promise<SubscriptionRow> {
  const { data, error } = await client
    .from("subscriptions")
    .update({
      plan: input.plan,
      status: input.status,
      fleet_panel_included: input.fleetPanelIncluded,
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

/**
 * Idempotência do webhook (08/2026): o Mercado Pago pode reentregar a mesma
 * notificação — antes de reaplicar `atualizarAssinaturaPorPagamento`,
 * checamos se já existe um evento igual (mesmo id + mesmo status) já
 * registrado em `payment_events`. Sem constraint única no banco de
 * propósito (é só log de auditoria, `company_id` pode ser nulo em eventos
 * sem `external_reference` decodificável) — a checagem é feita aqui, na
 * camada de aplicação.
 */
export async function eventoPagamentoJaProcessado(
  client: SupabaseDbClient,
  mercadopagoPaymentId: string,
  statusRecebido: string
): Promise<boolean> {
  const { data, error } = await client
    .from("payment_events")
    .select("id")
    .eq("mercadopago_payment_id", mercadopagoPaymentId)
    .eq("status_recebido", statusRecebido)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
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
