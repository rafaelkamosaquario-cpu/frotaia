import path from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

/**
 * Observabilidade mínima (prontidão de produção, 08/2026) — `withSentryConfig`
 * é seguro mesmo sem `SENTRY_AUTH_TOKEN`/org/project configurados: só pula o
 * upload de sourcemap com um aviso, nunca quebra o build. O SDK em si (init
 * runtime em sentry.server.config.ts/sentry.edge.config.ts) já é condicional
 * a `SENTRY_DSN` existir.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
});
