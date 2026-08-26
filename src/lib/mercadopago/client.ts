import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getMercadoPagoConfig } from "./config";
import { CATALOGO_OFERTAS, isOfertaPlano, type OfertaPlano } from "./catalog";

/**
 * Cliente mínimo pra API REST do Mercado Pago (Fase 2 do fluxo de
 * pagamento) — fetch direto, sem SDK oficial pesado, mesmo padrão de
 * calendarClient.ts/zapiClient.ts. Nenhum outro arquivo deve chamar
 * api.mercadopago.com diretamente.
 *
 * Preços vêm sempre de CATALOGO_OFERTAS (src/lib/mercadopago/catalog.ts) —
 * nunca hardcoded aqui. Nova estrutura comercial "Individual vs. Gestão"
 * definida com o Rafael em 23/08/2026.
 */

const MP_API_BASE = "https://api.mercadopago.com";

/**
 * `external_reference` sozinho não diz qual das 4 ofertas foi paga — só diz
 * a empresa. Codificamos `companyId|PLANO` na criação do link e
 * decodificamos na volta do webhook (`buscarPagamento`/`buscarAssinatura`
 * devolvem o valor exatamente como veio da API do Mercado Pago, sem
 * interpretar). O plano decodificado é só uma CHAVE pro catálogo — preço e
 * entitlement de verdade são sempre resolvidos de novo a partir dele, nunca
 * confiados de nenhum outro campo do payload do Mercado Pago.
 */
function codificarReferenciaExterna(companyId: string, plano: OfertaPlano): string {
  return `${companyId}|${plano}`;
}

export function decodificarReferenciaExterna(externalReference: string): { companyId: string; plano: OfertaPlano } | null {
  const [companyId, plano] = externalReference.split("|");
  if (!companyId || !plano || !isOfertaPlano(plano)) return null;
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
  /** MENSAL (Individual, R$79,90) ou GESTAO_MENSAL (upsell, R$99,90) — mesmo mecanismo de preapproval, preço/entitlement resolvidos via CATALOGO_OFERTAS. */
  plano: "MENSAL" | "GESTAO_MENSAL";
}

export interface LinkPagamentoResultado {
  id: string;
  initPoint: string;
}

function urlPadraoRetorno(): string {
  return process.env.APP_URL ?? "https://frotaia.app.br";
}

/**
 * Assinatura recorrente (preapproval) — criada do zero (sem
 * preapproval_plan_id) porque não temos como buscar programaticamente o ID
 * de um plano já criado manualmente no painel do Mercado Pago (endpoint de
 * busca por nome não é documentado). `payer_email` é campo obrigatório da
 * API do Mercado Pago pra preapproval — por isso a página `/assinar`
 * sempre pede o e-mail do cliente antes de chamar esta função.
 */
export async function criarAssinaturaMensal(input: CriarAssinaturaMensalInput): Promise<LinkPagamentoResultado> {
  const oferta = CATALOGO_OFERTAS[input.plano];

  const response = await fetch(`${MP_API_BASE}/preapproval`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      reason: oferta.label,
      external_reference: codificarReferenciaExterna(input.companyId, input.plano),
      payer_email: input.email,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: oferta.precoCentavos / 100,
        currency_id: "BRL",
      },
      back_url: `${urlPadraoRetorno()}/assinar/confirmacao?plano=${input.plano}`,
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
 * Cobrança única (Checkout Pro / preference) pro plano Gestão Anual — nunca
 * recorrente, sem renovação automática (cliente decide se contrata de novo
 * ao fim dos 12 meses). `excluded_payment_types` no modo PIX restringe as
 * outras formas — os IDs de tipo exatos (`credit_card`, `debit_card` etc.)
 * não têm confirmação 100% oficial na documentação pública consultada;
 * conferir visualmente na página de checkout gerada antes de divulgar.
 * `installments: 12` pede até 12 parcelas no Checkout Pro — se isso sai
 * "sem juros" ou não depende da configuração de taxas da própria conta
 * Mercado Pago, não é algo que esta chamada controle nem que dê pra
 * confirmar por código.
 */
export async function criarPagamentoAnual(input: CriarPagamentoAnualInput): Promise<LinkPagamentoResultado> {
  const plano: OfertaPlano = input.modo === "PARCELADO" ? "ANUAL_PARCELADO" : "ANUAL_PIX";
  const oferta = CATALOGO_OFERTAS[plano];
  const valorReais = oferta.precoCentavos / 100;

  const paymentMethods =
    input.modo === "PIX"
      ? {
          excluded_payment_types: [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }, { id: "prepaid_card" }],
        }
      : { installments: oferta.parcelas ?? 1 };

  const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      items: [{ title: oferta.label, quantity: 1, unit_price: valorReais, currency_id: "BRL" }],
      external_reference: codificarReferenciaExterna(input.companyId, plano),
      payment_methods: paymentMethods,
      back_urls: {
        success: `${urlPadraoRetorno()}/assinar/confirmacao?resultado=sucesso&plano=${plano}`,
        pending: `${urlPadraoRetorno()}/assinar/confirmacao?resultado=pendente&plano=${plano}`,
        failure: `${urlPadraoRetorno()}/assinar/confirmacao?resultado=falha&plano=${plano}`,
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

/**
 * Cancela uma assinatura recorrente (preapproval) — fechamento de troca de
 * plano (08/2026). API confirmada: `PUT /v1/preapproval/{id}` com
 * `{status: "cancelled"}` (não é DELETE). Usada SÓ pra encerrar a
 * assinatura ANTERIOR depois que a NOVA já está confirmada ativa no banco —
 * nunca antes, pra nunca deixar o cliente sem acesso entre as duas etapas.
 * Idempotente do lado do Mercado Pago: cancelar uma assinatura já cancelada
 * não é tratado como erro grave aqui — quem chama decide como reagir.
 */
export async function cancelarAssinatura(preapprovalId: string): Promise<void> {
  const response = await fetch(`${MP_API_BASE}/v1/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok) return parseErrorSafely(response);
}

/**
 * Fechamento final do risco residual (08/2026): decide se vale a pena
 * tentar cancelar de novo. Transitório (rede/timeout, 429, 5xx) → retry faz
 * sentido. Permanente (400/401/403/404 etc.) → o Mercado Pago já disse que
 * o pedido em si está errado, retry nunca vai resolver sozinho — mais cedo
 * ação manual é sinalizada, melhor.
 */
export function classificarErroCancelamento(erro: unknown): "transitorio" | "permanente" {
  if (erro instanceof MercadoPagoApiError) {
    if (erro.httpStatus === 429) return "transitorio";
    if (erro.httpStatus !== undefined && erro.httpStatus >= 500) return "transitorio";
    return "permanente";
  }
  // Erro de rede/timeout (fetch lançou antes de haver resposta HTTP) — desconhecido, mas retry é seguro (idempotente do lado do MP).
  return "transitorio";
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
