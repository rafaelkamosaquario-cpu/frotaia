import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Testa a camada de chamada HTTP ao Google (token/userinfo) com `fetch`
 * mockado — sem depender de credencial real nem de handshake OAuth de
 * verdade (isso continua exigindo teste manual ao vivo). Motivação: o bug
 * real de 06/08/2026 (401 em fetchGoogleUserInfo por falta do escopo
 * `userinfo.email`) levou ~1h30 pra ser diagnosticado — um teste que afirma
 * que os escopos configurados cobrem os endpoints realmente chamados por
 * `connectGoogleCalendar` pega essa classe de regressão na hora.
 */

vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({
  getGoogleCalendarConfig: () => ({
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_CALENDAR_REDIRECT_URI: "https://app.example.com/auth/calendar/callback",
    GOOGLE_CALENDAR_ENCRYPTION_KEY: "encryption-key",
    APP_URL: "https://app.example.com",
  }),
  GOOGLE_CALENDAR_SCOPES: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("GOOGLE_CALENDAR_SCOPES — regressão do bug de 06/08/2026", () => {
  it("inclui um escopo de identidade (userinfo.email) — exigido pelo endpoint oauth2/v2/userinfo que fetchGoogleUserInfo chama", async () => {
    const { GOOGLE_CALENDAR_SCOPES } = await import("./config");
    expect(GOOGLE_CALENDAR_SCOPES).toContain("https://www.googleapis.com/auth/userinfo.email");
  });
});

describe("calendarClient — endpoint de token (exchangeCodeForTokens/refreshAccessToken)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("exchangeCodeForTokens: sucesso devolve os tokens parseados", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "a b" })
    );
    const { exchangeCodeForTokens } = await import("./calendarClient");

    const tokens = await exchangeCodeForTokens("auth-code");
    expect(tokens).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 3600, scope: "a b" });
  });

  it("exchangeCodeForTokens: falha inclui o corpo da resposta do Google na mensagem (erro protocolar, não dado de conta)", async () => {
    // mockImplementation (não mockResolvedValue) porque o corpo da Response só
    // pode ser lido uma vez — este teste chama a função duas vezes.
    global.fetch = vi.fn().mockImplementation(async () =>
      jsonResponse(400, { error: "invalid_grant", error_description: "Malformed auth code." })
    );
    const { exchangeCodeForTokens, GoogleCalendarApiError } = await import("./calendarClient");

    await expect(exchangeCodeForTokens("codigo-invalido")).rejects.toThrow(GoogleCalendarApiError);
    try {
      await exchangeCodeForTokens("codigo-invalido");
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(GoogleCalendarApiError);
      expect((erro as InstanceType<typeof GoogleCalendarApiError>).httpStatus).toBe(400);
      expect((erro as Error).message).toContain("invalid_grant");
    }
  });

  it("refreshAccessToken: falha também usa parseTokenErrorSafely (corpo incluído)", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(401, { error: "invalid_grant" }));
    const { refreshAccessToken, GoogleCalendarApiError } = await import("./calendarClient");

    await expect(refreshAccessToken("refresh-token-expirado")).rejects.toThrow(GoogleCalendarApiError);
  });
});

describe("calendarClient — endpoints de conta/calendário (fetchGoogleUserInfo etc.)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetchGoogleUserInfo: sucesso devolve email e subjectId", async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { email: "motorista@example.com", id: "123" }));
    const { fetchGoogleUserInfo } = await import("./calendarClient");

    const info = await fetchGoogleUserInfo("access-token-valido");
    expect(info).toEqual({ email: "motorista@example.com", subjectId: "123" });
  });

  it("fetchGoogleUserInfo: falha (ex. 401 por escopo faltando) NUNCA inclui o corpo da resposta na mensagem — pode conter dado de conta", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { message: "dado sensível de conta que nunca deve vazar pro log/erro" } })
    );
    const { fetchGoogleUserInfo, GoogleCalendarApiError } = await import("./calendarClient");

    try {
      await fetchGoogleUserInfo("access-token-sem-escopo");
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(GoogleCalendarApiError);
      expect((erro as InstanceType<typeof GoogleCalendarApiError>).httpStatus).toBe(401);
      expect((erro as Error).message).not.toContain("dado sensível de conta");
    }
  });
});
