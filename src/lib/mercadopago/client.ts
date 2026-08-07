import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getMercadoPagoConfig } from "./config";
import type { SubscriptionPlanEnum } from "@/lib/supabase/tables";

/**
 * Cliente mínimo pra API REST do Mercado Pago (Fase 2 do fluxo de
 * pagamento) — fetch direto, sem SDK oficial pesado, mesmo padrão de
 * calendarClient.ts/zapiClient.ts. Nenhum outro arquivo deve chamar
 * api.mercadopago.com diretamente.
 *
 * Preços definidos junto com o Rafael em 06/08/2026 — ver [[project_frota_ia_status]].
 */

const MP_API_BASE = "https://api.mercadopago.com";

export const PRECOS_CENTAVOS: Record<Exclude<SubscriptionPlanEnum, "TRIAL" | "EMPRESA">, number> = {
  MENSAL: 7990,
  ANUAL_PARCELADO: 71880,
  ANUAL_PIX: 64700,
};

/**
 * `external_reference` sozinho não diz qual dos 3 planos automatizados foi
 * pago — só diz a empresa. Codificamos `companyId|PLANO` na criação do
 * link e decodificamos na volta do webhook (`buscarPagamento`/
 * `buscarAssinatura` devolvem o valor exatamente como veio da API do
 * Mercado Pago, sem interpretar).
 */
function codificarReferenciaExterna(companyId: string, plano: Exclude<SubscriptionPlanEnum, "TRIAL" | "EMPRESA">): string {
  return `${companyId}|${plano}`;
}

export function decodificarReferenciaExterna(externalReference: string): { companyId: string; plano: SubscriptionPlanEnum } | null {
  const [companyId, plano] = externalReference.split("|");
  if (!companyId || !plano) return null;
  if (plano !== "MENSAL" && plano !== "ANUAL_PARCELADO" && plano !== "ANUAL_PIX") return null;
  return { companyId, plano };
}

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number
  ) {
    super(message);
    this.name = "MercadoPagoApiError";
  }
}

/** Nunca inclui o corpo da resposta na mensagem — pode conter dado de pagador. */
async function parseErrorSafely(response: Response): Promise<never> {
  throw new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", response.status);
}

function authHeaders(): HeadersInit {
  const { MERCADOPAGO_ACCESS_TOKEN } = getMercadoPagoConfig();
  return { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json" };
}

export interface CriarAssinaturaMensalInput {
  companyId: string;
  email: string;
}

export interface LinkPagamentoResultado {
  id: string;
  initPoint: string;
}

/**
 * Assinatura recorrente (preapproval) pro plano Mensal — criada do zero
 * (sem preapproval_plan_id) porque não temos como buscar programaticamente
 * o ID do plano "Frota IA Mensal" já criado manualmente no painel do
 * Mercado Pago (endpoint de busca por nome não é documentado). Os dois
 * ficam desacoplados de propósito — o link fixo do painel continua servindo
 * só como referência/vitrine, nunca é o que vira acesso liberado.
 * `payer_email` é campo obrigatório da API do Mercado Pago pra preapproval
 * — por isso `gerenciar_assinatura` (ferramenta da Fase 5) precisa pedir o
 * e-mail do cliente antes de gerar este link.
 */
export async function criarAssinaturaMensal(input: CriarAssinaturaMensalInput): Promise<LinkPagamentoResultado> {
  const response = await fetch(`${MP_API_BASE}/preapproval`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      reason: "Frota IA Mensal",
      external_reference: codificarReferenciaExterna(input.companyId, "MENSAL"),
      payer_email: input.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PRECOS_CENTAVOS.MENSAL / 100,
        currency_id: "BRL",
      },
      back_url: process.env.APP_URL ?? "https://frotaia.app.br",
    }),
  });

  if (!response.ok) return parseErrorSafely(response);
  const body = (await response.json()) as { id: string; init_point: string };
  return { id: body.id, initPoint: body.init_point };
}

export interface CriarPagamentoAnualInput {
  companyId: string;
  modo: "PARCELADO" | "PIX";
}

/**
 * Cobrança única (Checkout Pro / preference) pros planos Anuais — nunca
 * recorrente, o cliente é avisado antes do vencimento (ver Fase 5) e decide
 * se contrata de novo. `excluded_payment_types` no modo PIX restringe as
 * outras formas — os IDs de tipo exatos (`credit_card`, `debit_card` etc.)
 * não têm confirmação 100% oficial na documentação pública consultada;
 * conferir visualmente na página de checkout gerada antes de divulgar.
 */
export async function criarPagamentoAnual(input: CriarPagamentoAnualInput): Promise<LinkPagamentoResultado> {
  const plano: SubscriptionPlanEnum = input.modo === "PARCELADO" ? "ANUAL_PARCELADO" : "ANUAL_PIX";
  const valorReais = PRECOS_CENTAVOS[plano] / 100;
  const titulo = input.modo === "PARCELADO" ? "Frota IA Anual (parcelado)" : "Frota IA Anual (Pix)";

  const paymentMethods =
    input.modo === "PIX"
      ? {
          excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "prepaid_card" }],
        }
      : { installments: 12 };

  const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      items: [{ title: titulo, quantity: 1, unit_price: valorReais, currency_id: "BRL" }],
      external_reference: codificarReferenciaExterna(input.companyId, plano),
      payment_methods: paymentMethods,
      back_urls: {
        success: process.env.APP_URL ?? "https://frotaia.app.br",
        pending: process.env.APP_URL ?? "https://frotaia.app.br",
        failure: process.env.APP_URL ?? "https://frotaia.app.br",
      },
    }),
  });

  if (!response.ok) return parseErrorSafely(response);
  const body = (await response.json()) as { id: string; init_point: string };
  return { id: body.id, initPoint: body.init_point };
}

export interface PagamentoConsultado {
  status: string;
  externalReference: string | null;
  valorCentavos: number;
}

/** Sempre reconsultado na API antes de confiar em qualquer notificação de webhook — nunca confia só no payload recebido. */
export async function buscarPagamento(paymentId: string): Promise<PagamentoConsultado> {
  const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) return parseErrorSafely(response);
  const body = (await response.json()) as { status: string; external_reference: string | null; transaction_amount: number };
  return { status: body.status, externalReference: body.external_reference, valorCentavos: Math.round(body.transaction_amount * 100) };
}

export interface AssinaturaConsultada {
  status: string;
  externalReference: string | null;
}

export async function buscarAssinatura(preapprovalId: string): Promise<AssinaturaConsultada> {
  const response = await fetch(`${MP_API_BASE}/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: authHeaders(),
  });
  if (!response.ok) return parseErrorSafely(response);
  const body = (await response.json()) as { status: string; external_reference: string | null };
  return { status: body.status, externalReference: body.external_reference };
}

export interface ValidarWebhookInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataIdQueryParam: string | null;
  secret: string;
}

/**
 * Validação de assinatura de webhook — manifest e algoritmo confirmados na
 * documentação oficial do Mercado Pago (06/08/2026):
 * `id:{data.id};request-id:{x-request-id};ts:{ts};`, omitindo pares cujo
 * valor não veio na notificação, HMAC-SHA256 hex contra o segredo do
 * webhook, comparado em tempo constante contra o `v1` do header
 * `x-signature` (formato `ts=...,v1=...`). `data.id` sempre vem do query
 * string da URL (nunca do corpo JSON) e é comparado em minúsculas.
 */
export function validarAssinaturaWebhook(input: ValidarWebhookInput): boolean {
  if (!input.xSignature) return false;

  let ts: string | undefined;
  let hash: string | undefined;
  for (const part of input.xSignature.split(",")) {
    const [key, ...rest] = part.split("=");
    const value = rest.join("=").trim();
    if (key.trim() === "ts") ts = value;
    if (key.trim() === "v1") hash = value;
  }
  if (!ts || !hash) return false;

  const partes: string[] = [];
  if (input.dataIdQueryParam) partes.push(`id:${input.dataIdQueryParam.toLowerCase()}`);
  if (input.xRequestId) partes.push(`request-id:${input.xRequestId}`);
  partes.push(`ts:${ts}`);
  const manifest = partes.join(";") + ";";

  const computed = createHmac("sha256", input.secret).update(manifest).digest("hex");

  const bufComputed = Buffer.from(computed);
  const bufHash = Buffer.from(hash);
  return bufComputed.length === bufHash.length && timingSafeEqual(bufComputed, bufHash);
}
