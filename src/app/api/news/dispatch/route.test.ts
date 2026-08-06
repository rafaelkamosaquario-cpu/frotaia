import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CompanyPreferencesRow, UserChannelRow } from "@/lib/supabase/tables";

/**
 * Mesmo objetivo do teste de /api/alerts/dispatch: cobrir o branching real
 * da rota (token, config ausente, resumo indisponível, distribuição por
 * empresa, dedup de número, falha parcial) sem Supabase/Z-API/Claude reais.
 */

const listCompaniesDueForNewsDigest = vi.fn();
const markNewsDigestSent = vi.fn();
const listChannelsForCompany = vi.fn();
const gerarResumoNoticias = vi.fn();
const sendWhatsappText = vi.fn();
const isWhatsappConfigured = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappText: (...args: unknown[]) => sendWhatsappText(...args) }));
vi.mock("@/lib/whatsapp/config", () => ({ isWhatsappConfigured: () => isWhatsappConfigured() }));
vi.mock("@/services/supabase/companyPreferencesService", () => ({
  listCompaniesDueForNewsDigest: (...args: unknown[]) => listCompaniesDueForNewsDigest(...args),
  markNewsDigestSent: (...args: unknown[]) => markNewsDigestSent(...args),
}));
vi.mock("@/services/supabase/channelIdentityService", () => ({
  listChannelsForCompany: (...args: unknown[]) => listChannelsForCompany(...args),
}));
vi.mock("@/services/news/newsDigestService", () => ({
  gerarResumoNoticias: (...args: unknown[]) => gerarResumoNoticias(...args),
}));

function fakeCompany(overrides: Partial<CompanyPreferencesRow> = {}): CompanyPreferencesRow {
  return { company_id: "empresa-1", ...overrides } as CompanyPreferencesRow;
}

function fakeChannel(overrides: Partial<UserChannelRow> = {}): UserChannelRow {
  return { channel_type: "whatsapp", phone_e164: "+5541999998888", ...overrides } as UserChannelRow;
}

const SECRET = "segredo-de-teste";
const RESUMO = "📰 Notícias do setor hoje:\n1. Exemplo\nhttps://exemplo.com/materia";

async function chamarRota(query = `?token=${SECRET}`) {
  const { GET } = await import("./route");
  return GET(new Request(`https://app.example.com/api/news/dispatch${query}`));
}

describe("GET /api/news/dispatch", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEWS_DISPATCH_SECRET = SECRET;
    isWhatsappConfigured.mockReturnValue(true);
    gerarResumoNoticias.mockResolvedValue(RESUMO);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("503 quando NEWS_DISPATCH_SECRET não está configurado", async () => {
    delete process.env.NEWS_DISPATCH_SECRET;
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("401 com token errado", async () => {
    const resposta = await chamarRota("?token=errado");
    expect(resposta.status).toBe(401);
    expect(listCompaniesDueForNewsDigest).not.toHaveBeenCalled();
  });

  it("503 quando o WhatsApp não está configurado", async () => {
    isWhatsappConfigured.mockReturnValue(false);
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("sem empresa elegível: não gera resumo nenhum (evita custo de Claude à toa)", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([]);
    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(gerarResumoNoticias).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, empresas: 0, enviados: 0, falhas: 0 });
  });

  it("502 quando gerarResumoNoticias lança erro", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany()]);
    gerarResumoNoticias.mockRejectedValue(new Error("Claude fora do ar"));

    const resposta = await chamarRota();
    expect(resposta.status).toBe(502);
    expect(sendWhatsappText).not.toHaveBeenCalled();
  });

  it("502 quando gerarResumoNoticias devolve null (nada relevante achado)", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany()]);
    gerarResumoNoticias.mockResolvedValue(null);

    const resposta = await chamarRota();
    expect(resposta.status).toBe(502);
  });

  it("gera o resumo UMA vez só e distribui pra todas as empresas elegíveis", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany({ company_id: "empresa-1" }), fakeCompany({ company_id: "empresa-2" })]);
    listChannelsForCompany.mockResolvedValue([fakeChannel()]);
    sendWhatsappText.mockResolvedValue(undefined);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(gerarResumoNoticias).toHaveBeenCalledTimes(1);
    expect(sendWhatsappText).toHaveBeenCalledTimes(2);
    expect(markNewsDigestSent).toHaveBeenCalledWith(expect.anything(), "empresa-1");
    expect(markNewsDigestSent).toHaveBeenCalledWith(expect.anything(), "empresa-2");
    expect(corpo).toEqual({ ok: true, empresas: 2, enviados: 2, falhas: 0 });
  });

  it("deduplica números repetidos (2 usuários com o mesmo telefone na mesma empresa) — envia só uma vez", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany()]);
    listChannelsForCompany.mockResolvedValue([fakeChannel(), fakeChannel({ user_id: "outro-usuario" } as Partial<UserChannelRow>)]);
    sendWhatsappText.mockResolvedValue(undefined);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).toHaveBeenCalledTimes(1);
    expect(corpo.enviados).toBe(1);
  });

  it("empresa sem canal de WhatsApp é pulada, sem marcar como enviada", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany()]);
    listChannelsForCompany.mockResolvedValue([]);

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(sendWhatsappText).not.toHaveBeenCalled();
    expect(markNewsDigestSent).not.toHaveBeenCalled();
    expect(corpo).toEqual({ ok: true, empresas: 1, enviados: 0, falhas: 0 });
  });

  it("falha parcial (1 número falha, outro funciona) ainda marca a empresa como enviada", async () => {
    listCompaniesDueForNewsDigest.mockResolvedValue([fakeCompany()]);
    listChannelsForCompany.mockResolvedValue([fakeChannel({ phone_e164: "+5541900000001" }), fakeChannel({ phone_e164: "+5541900000002" })]);
    sendWhatsappText.mockImplementation(async (numero: string) => {
      if (numero === "+5541900000002") throw new Error("Z-API rejeitou");
    });

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(markNewsDigestSent).toHaveBeenCalledWith(expect.anything(), "empresa-1");
    expect(corpo).toEqual({ ok: true, empresas: 1, enviados: 1, falhas: 1 });
  });
});
