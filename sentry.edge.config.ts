import * as Sentry from "@sentry/nextjs";

/** Mesmo princípio de sentry.server.config.ts, pro runtime edge (middleware, se algum dia existir). */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.05,
    environment: process.env.NODE_ENV,
  });
}
