import * as Sentry from "@sentry/nextjs";

/**
 * Camada mínima de observabilidade (prontidão de produção, 08/2026) — log
 * estruturado em JSON de 1 linha (buscável nos logs do Railway) + Sentry
 * quando `SENTRY_DSN` estiver configurado (`Sentry.captureException`/
 * `captureMessage` são no-op seguro sem `Sentry.init`, então funciona sem
 * quebrar nada mesmo antes de existir um projeto Sentry configurado).
 *
 * NUNCA passar em `fields`: secrets, tokens (access/refresh), API keys,
 * conteúdo de documento, texto integral de mensagem/conversa, dado
 * financeiro sensível (número de cartão etc.). IDs técnicos (company_id,
 * conversation_id, driver_id, route, error_code) são seguros e esperados.
 */

interface BaseFields {
  event: string;
  route: string;
  [key: string]: unknown;
}

function linha(fields: Record<string, unknown>): string {
  return JSON.stringify({ ts: new Date().toISOString(), ...fields });
}

/** Log de sucesso/andamento — nunca usar pra erro (ver captureError). */
export function logEvent(fields: BaseFields): void {
  console.log(linha(fields));
}

/** Log de erro + Sentry, com a mensagem do erro extraída com segurança (nunca o objeto de erro inteiro, que pode carregar payload de request). */
export function captureError(fields: BaseFields & { error: unknown; errorCode?: string }): void {
  const { error, ...resto } = fields;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(linha({ ...resto, errorMessage }));
  Sentry.captureException(error, {
    tags: { event: fields.event, route: fields.route, ...(fields.errorCode ? { error_code: fields.errorCode } : {}) },
    extra: resto,
  });
}

/** Marca o início de um job de dispatch (cron) — devolve o timestamp pra calcular a duração no fim. */
export function logDispatchStart(route: string): number {
  logEvent({ event: "dispatch_start", route });
  return Date.now();
}

export interface DispatchResultFields {
  processados: number;
  sucesso: number;
  falha: number;
}

/** Marca o fim de um job de dispatch, sempre com duração e contadores — mesmo padrão nos 5 crons. */
export function logDispatchEnd(route: string, startedAt: number, resultado: DispatchResultFields): void {
  logEvent({
    event: "dispatch_end",
    route,
    duration_ms: Date.now() - startedAt,
    ...resultado,
    success: resultado.falha === 0,
  });
}
