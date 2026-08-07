import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SubscriptionRow, UserChannelRow } from "@/lib/supabase/tables";

const listarTestesParaAvisar = vi.fn();
const marcarAvisoTrialEnviado = vi.fn();
const listChannelsForCompany = vi.fn();
const sendWhatsappText = vi.fn();
const isWhatsappConfigured = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappText: (...args: unknown[]) => sendWhatsappText(...args) }));
vi.mock("@/lib/whatsapp/config", () => ({ isWhatsappConfigured: () => isWhatsappConfigured() }));
vi.mock("@/services/supabase/subscriptionService", () => ({
  listarTestesParaAvisar: (...args: unknown[]) => listarTestesParaAvisar(...args),
  marcarAvisoTrialEnviado: (...args: unknown[]) => marcarAvisoTrialEnviado(...args),
}));
vi.mock("@/services/supabase/channelIdentityService", () => ({
  listChannelsForCompany: (...args: unknown[]) => listChannelsForCompany(...args),
}));

const AGORA = Date.now();
const DIA = 24 * 60 * 60 * 1000;

function fakeTeste(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    company_id: "empresa-1",
    trial_iniciado_em: new Date(AGORA - 2 * DIA).toISOString(),
    valido_ate: new Date(AGORA + 5 * DIA).toISOString(),
    trial_avisado_dia5: false,
    trial_avisado_ultimo_dia: false,
    ...overrides,
  } as SubscriptionRow;
}

function fakeChannel(overrides: Partial<UserChannelRow> = {}): UserChannelRow {
  return { channel_type: "whatsapp", phone_e164: "+5541999998888", ...overrides } as UserChannelRow;
}

const SECRET = "segredo-de-teste";

async function chamarRota(query = `?token=${SECRET}`) {
  const { GET } = await import("./route");
  return GET(new Request(`https://app.example.com/api/subscriptions/trial-warnings/dispatch${query}`));
}

describe("GET /api/subscriptions/trial-warnings/dispatch", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRIAL_WARNINGS_DISPATCH_SECRET = SECRET;
    isWhatsappConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("503 quando TRIAL_WARNINGS_DISPATCH_SECRET não está configurado", async () => {
    delete process.env.TRIAL_WARNINGS_DISPATCH_SECRET;
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("401 com token errado", async () => {
    const resposta = await chamarRota("?token=errado");
    expect(resposta.status).toBe(401);
    expect(listarTestesParaAvisar).not.toHaveBeenCalled();
  });

  it("503 quando o WhatsApp não está configurado", async () => {
    isWhatsappConfigured.mockReturnValue(false);
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("manda o aviso de dia 5 e marca como enviado", async () => {
    listarTestesParaAvisar.mockResolvedValue([fakeTeste({ trial_iniciado_em: new Date(AGORA - 5 * DIA - 1000).toISOString() })]);
    listChannelsForCompany.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockResolvedValue(undefined);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("5 dias"));
    expect(marcarAvisoTrialEnviado).toHaveBeenCalledWith(expect.anything(), "empresa-1", "dia5");
    expect(marcarAvisoTrialEnviado).not.toHaveBeenCalledWith(expect.anything(), "empresa-1", "ultimoDia");
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 1, falhas: 0 });
  });

  it("manda o aviso de último dia e marca como enviado", async () => {
    listarTestesParaAvisar.mockResolvedValue([fakeTeste({ valido_ate: new Date(AGORA + 1000).toISOString() })]);
    listChannelsForCompany.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockResolvedValue(undefined);

    await chamarRota();

    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("último dia"));
    expect(marcarAvisoTrialEnviado).toHaveBeenCalledWith(expect.anything(), "empresa-1", "ultimoDia");
  });

  it("manda os dois avisos juntos quando os dois se aplicam (ex.: cron ficou parado alguns dias)", async () => {
    listarTestesParaAvisar.mockResolvedValue([
      fakeTeste({ trial_iniciado_em: new Date(AGORA - 6 * DIA).toISOString(), valido_ate: new Date(AGORA + 1000).toISOString() }),
    ]);
    listChannelsForCompany.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockResolvedValue(undefined);

    await chamarRota();

    expect(sendWhatsappText).toHaveBeenCalledTimes(2);
    expect(marcarAvisoTrialEnviado).toHaveBeenCalledWith(expect.anything(), "empresa-1", "dia5");
    expect(marcarAvisoTrialEnviado).toHaveBeenCalledWith(expect.anything(), "empresa-1", "ultimoDia");
  });

  it("não marca como enviado quando o envio falha (permite tentar de novo no próximo run)", async () => {
    listarTestesParaAvisar.mockResolvedValue([fakeTeste({ trial_iniciado_em: new Date(AGORA - 5 * DIA - 1000).toISOString() })]);
    listChannelsForCompany.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockRejectedValue(new Error("Z-API fora do ar"));

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(marcarAvisoTrialEnviado).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 0, falhas: 1 });
  });

  it("empresa sem canal de WhatsApp é pulada, sem marcar nada", async () => {
    listarTestesParaAvisar.mockResolvedValue([fakeTeste({ trial_iniciado_em: new Date(AGORA - 5 * DIA - 1000).toISOString() })]);
    listChannelsForCompany.mockResolvedValue([]);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).not.toHaveBeenCalled();
    expect(marcarAvisoTrialEnviado).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, verificados: 1, enviados: 0, falhas: 0 });
  });
});
