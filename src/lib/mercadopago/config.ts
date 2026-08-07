import "server-only";

/**
 * Configuração da integração Mercado Pago (Fase 2 do fluxo de pagamento).
 * Mesmo padrão de google/config.ts e whatsapp/config.ts — nunca lê
 * process.env.MERCADOPAGO_* espalhado pelo código, nunca vaza valor em
 * mensagem de erro.
 */

const REQUIRED_VARS = ["MERCADOPAGO_ACCESS_TOKEN"] as const;

export type MercadoPagoConfig = Record<(typeof REQUIRED_VARS)[number], string>;

export class MercadoPagoConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Configuração do Mercado Pago incompleta. Variáveis ausentes: ${missing.join(", ")}.`);
    this.name = "MercadoPagoConfigError";
  }
}

export function getMercadoPagoConfig(): MercadoPagoConfig {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new MercadoPagoConfigError(missing);
  return Object.fromEntries(REQUIRED_VARS.map((name) => [name, process.env[name] as string])) as MercadoPagoConfig;
}

export function isMercadoPagoConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

/**
 * Segredo do webhook — separado dos REQUIRED_VARS acima porque só existe
 * DEPOIS que a rota /api/payments/mercadopago/webhook já estiver no ar e
 * cadastrada no painel do Mercado Pago (Suas integrações > Webhooks >
 * Configurar notificação revela o segredo). Checado só dentro da própria
 * rota do webhook, nunca bloqueia geração de link de pagamento.
 */
export function getMercadoPagoWebhookSecret(): string | null {
  return process.env.MERCADOPAGO_WEBHOOK_SECRET || null;
}
