import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade mínima (prontidão de produção, 08/2026) — registra o SDK
 * do Sentry pro runtime certo (server Node.js ou edge) e exporta o hook de
 * captura automática de erro não tratado em Server Components/rotas. Isso é
 * rede de segurança, não a fonte principal de captura: as rotas de maior
 * risco (webhook WhatsApp, Mercado Pago, dispatch, /api/chat) já chamam
 * `captureError` explicitamente nos próprios catch blocks (ver
 * src/lib/observability/logger.ts), porque a maioria delas trata o erro e
 * devolve uma resposta controlada em vez de deixar a exceção subir.
 * `captureRequestError` é seguro chamar mesmo sem `SENTRY_DSN` configurado
 * (vira no-op, mesmo princípio dos outros arquivos sentry.*.config.ts).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
