import * as Sentry from "@sentry/nextjs";

/**
 * Observabilidade mínima (prontidão de produção, 08/2026) — só inicializa
 * de verdade se SENTRY_DSN estiver configurado; sem isso, todo `Sentry.*`
 * chamado no resto do código vira no-op seguro (não quebra nada enquanto
 * não existir um projeto Sentry criado). `tracesSampleRate` baixo — este
 * projeto quer error tracking, não tracing de performance detalhado.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.05,
    environment: process.env.NODE_ENV,
  });
}
