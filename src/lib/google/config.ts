import "server-only";

/**
 * Configuração da integração Google Calendar. Centralizado para nunca ler
 * `process.env.GOOGLE_*` espalhado pelo código, e para nunca vazar valor de
 * variável em mensagem de erro (só o nome da variável ausente).
 */

const REQUIRED_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "GOOGLE_CALENDAR_ENCRYPTION_KEY",
  "APP_URL",
] as const;

export type GoogleCalendarConfig = Record<(typeof REQUIRED_VARS)[number], string>;

export class GoogleCalendarConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Configuração do Google Calendar incompleta. Variáveis ausentes: ${missing.join(", ")}.`);
    this.name = "GoogleCalendarConfigError";
  }
}

/** Lança GoogleCalendarConfigError (nunca o valor da variável) se algo estiver faltando. */
export function getGoogleCalendarConfig(): GoogleCalendarConfig {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new GoogleCalendarConfigError(missing);
  }

  return Object.fromEntries(REQUIRED_VARS.map((name) => [name, process.env[name] as string])) as GoogleCalendarConfig;
}

/** Só checa disponibilidade, sem lançar — para exibir "conectar" ou "indisponível" na UI/WhatsApp. */
export function isGoogleCalendarConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

/**
 * Escopos mínimos: leitura da lista de calendários + leitura/escrita de
 * eventos, + `userinfo.email` (necessário porque connectGoogleCalendar
 * chama o endpoint oauth2/v2/userinfo pra identificar de qual conta é —
 * sem escopo de identidade, o Google devolve 401 nesse endpoint mesmo com
 * um access token de Calendar válido — bug real encontrado em 06/08/2026,
 * a troca de código por token sempre funcionou, só essa segunda chamada
 * falhava). Não usa o escopo amplo `calendar` (que também permite apagar
 * calendários inteiros) nem `profile`/`openid` (não precisa de nome, só
 * do e-mail pra exibir "Agenda conectada (fulano@gmail.com)").
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;
