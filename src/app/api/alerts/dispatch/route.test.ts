import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ScheduledAlertRow } from "@/lib/supabase/tables";
import type { UserChannelRow } from "@/lib/supabase/tables";

/**
 * Testa a lógica de branching da rota (token, config ausente, sucesso,
 * canal ausente, falha de envio) com tudo externo mockado — Supabase e
 * Z-API nunca são tocados de verdade. Complementa (não substitui) o teste
 * manual ao vivo, que continua sendo o único jeito de validar o envio real.
 */

const listDueAlerts = vi.fn();
const markAlertSent = vi.fn();
const markAlertFailed = vi.fn();
const listChannelsForUser = vi.fn();
const sendWhatsappText = vi.fn();
const isWhatsappConfigured = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappText: (...args: unknown[]) => sendWhatsappText(...args) }));
vi.mock("@/lib/whatsapp/config", () => ({ isWhatsappConfigured: () => isWhatsappConfigured() }));
vi.mock("@/services/supabase/alertService", () => ({
  listDueAlerts: (...args: unknown[]) => listDueAlerts(...args),
  markAlertSent: (...args: unknown[]) => markAlertSent(...args),
  markAlertFailed: (...args: unknown[]) => markAlertFailed(...args),
}));
vi.mock("@/services/supabase/channelIdentityService", () => ({
  listChannelsForUser: (...args: unknown[]) => listChannelsForUser(...args),
}));

function fakeAlert(overrides: Partial<ScheduledAlertRow> = {}): ScheduledAlertRow {
  return { id: "alert-1", user_id: "user-1", title: "Vencimento do seguro", notes: null, ...overrides } as ScheduledAlertRow;
}

function fakeChannel(overrides: Partial<UserChannelRow> = {}): UserChannelRow {
  return { channel_type: "whatsapp", phone_e164: "+5541999998888", ...overrides } as UserChannelRow;
}

const SECRET = "segredo-de-teste";

async function chamarRota(query = `?token=${SECRET}`) {
  const { GET } = await import("./route");
  return GET(new Request(`https://app.example.com/api/alerts/dispatch${query}`));
}

describe("GET /api/alerts/dispatch", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALERTS_DISPATCH_SECRET = SECRET;
    isWhatsappConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("503 quando ALERTS_DISPATCH_SECRET não está configurado", async () => {
    delete process.env.ALERTS_DISPATCH_SECRET;
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("401 com token errado", async () => {
    const resposta = await chamarRota("?token=errado");
    expect(resposta.status).toBe(401);
    expect(listDueAlerts).not.toHaveBeenCalled();
  });

  it("503 quando o WhatsApp não está configurado", async () => {
    isWhatsappConfigured.mockReturnValue(false);
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("envia e marca como sent quando há canal de WhatsApp", async () => {
    listDueAlerts.mockResolvedValue([fakeAlert()]);
    listChannelsForUser.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockResolvedValue(undefined);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("Vencimento do seguro"));
    expect(markAlertSent).toHaveBeenCalledWith(expect.anything(), "alert-1");
    expect(markAlertFailed).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 1, falhas: 0 });
  });

  it("marca como failed quando o usuário não tem canal de WhatsApp com telefone", async () => {
    listDueAlerts.mockResolvedValue([fakeAlert()]);
    listChannelsForUser.mockResolvedValue([]);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).not.toHaveBeenCalled();
    expect(markAlertFailed).toHaveBeenCalledWith(expect.anything(), "alert-1", expect.any(String));
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 0, falhas: 1 });
  });

  it("marca como failed quando o envio pelo WhatsApp lança erro", async () => {
    listDueAlerts.mockResolvedValue([fakeAlert()]);
    listChannelsForUser.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockRejectedValue(new Error("Z-API fora do ar"));

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(markAlertFailed).toHaveBeenCalledWith(expect.anything(), "alert-1", expect.any(String));
    expect(markAlertSent).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 0, falhas: 1 });
  });
});
