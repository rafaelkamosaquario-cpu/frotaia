import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Radar de Fretes — evolução funcional 08/2026 (Rodada 2). Cobre o motor de
 * matching/notificação (nunca testado antes): idempotência, anti-spam
 * (só FORTE notifica), isolamento multiempresa e a nova pré-análise no modo
 * "analisar antes de avisar" (nunca finge cálculo quando falta dado).
 */

vi.mock("server-only", () => ({}));

const listAllActiveRadars = vi.fn();
const createMatch = vi.fn();
const markMatchNotified = vi.fn();
const markMatchAnalyzed = vi.fn();
const getVehicle = vi.fn();
const getActiveCostProfile = vi.fn();
const getOrCreatePreferences = vi.fn();
const listChannelsForCompany = vi.fn();
const sendWhatsappText = vi.fn();
const startAnalysisRun = vi.fn();
const completeAnalysisRun = vi.fn();
const failAnalysisRun = vi.fn();
const getOrCreateOpenConversation = vi.fn();
const appendMessage = vi.fn();
const consultarRotaExecutar = vi.fn();
const calcularCombustivelExecutar = vi.fn();
const analisarFreteExecutar = vi.fn();

vi.mock("@/services/supabase/freightRadarService", () => ({ listAllActiveRadars: (...a: unknown[]) => listAllActiveRadars(...a) }));
vi.mock("@/services/supabase/freightMatchService", () => ({
  createMatch: (...a: unknown[]) => createMatch(...a),
  markMatchNotified: (...a: unknown[]) => markMatchNotified(...a),
  markMatchAnalyzed: (...a: unknown[]) => markMatchAnalyzed(...a),
}));
vi.mock("@/services/supabase/vehicleService", () => ({ getVehicle: (...a: unknown[]) => getVehicle(...a) }));
vi.mock("@/services/supabase/vehicleCostProfileService", () => ({ getActiveCostProfile: (...a: unknown[]) => getActiveCostProfile(...a) }));
vi.mock("@/services/supabase/companyPreferencesService", () => ({ getOrCreatePreferences: (...a: unknown[]) => getOrCreatePreferences(...a) }));
vi.mock("@/services/supabase/channelIdentityService", () => ({ listChannelsForCompany: (...a: unknown[]) => listChannelsForCompany(...a) }));
vi.mock("@/lib/whatsapp/zapiClient", () => ({ sendWhatsappText: (...a: unknown[]) => sendWhatsappText(...a) }));
vi.mock("@/services/supabase/analysisHistoryService", () => ({
  startAnalysisRun: (...a: unknown[]) => startAnalysisRun(...a),
  completeAnalysisRun: (...a: unknown[]) => completeAnalysisRun(...a),
  failAnalysisRun: (...a: unknown[]) => failAnalysisRun(...a),
}));
vi.mock("@/services/supabase/conversationService", () => ({
  getOrCreateOpenConversation: (...a: unknown[]) => getOrCreateOpenConversation(...a),
  appendMessage: (...a: unknown[]) => appendMessage(...a),
}));
vi.mock("@/ai/tools", () => ({
  ferramentaConsultarRota: { executar: (...a: unknown[]) => consultarRotaExecutar(...a) },
  ferramentaCalcularCombustivel: { executar: (...a: unknown[]) => calcularCombustivelExecutar(...a) },
  ferramentaAnalisarFrete: { executar: (...a: unknown[]) => analisarFreteExecutar(...a) },
}));

const RADAR_EMPRESA_1 = {
  id: "radar-1",
  company_id: "empresa-1",
  user_id: "user-1",
  vehicle_id: "veiculo-1",
  status: "active",
  origin_state: "PR",
  destination_state: "SP",
  origin_city: null,
  destination_city: null,
  destination_region_label: null,
  available_from: null,
  available_until: null,
};

const OPORTUNIDADE = {
  id: "oportunidade-1",
  origin_city: "Curitiba",
  origin_state: "PR",
  destination_city: "São Paulo",
  destination_state: "SP",
  freight_value_cents: 500000,
  weight_kg: 10000,
  body_type: null,
  pickup_date: null,
};

const VEICULO = { id: "veiculo-1", body_type: null, average_consumption_km_l: 3, name: "Cavalo 1" };

describe("processarNovaOportunidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrCreatePreferences.mockResolvedValue({ freight_radar_analysis_mode: "avisar_primeiro" });
    listChannelsForCompany.mockResolvedValue([{ channel_type: "whatsapp", phone_e164: "+5541999998888", id: "canal-1" }]);
    getOrCreateOpenConversation.mockResolvedValue({ id: "conversa-1" });
    appendMessage.mockResolvedValue(undefined);
    sendWhatsappText.mockResolvedValue(undefined);
    getVehicle.mockResolvedValue(VEICULO);
  });

  it("radar com UF de origem/destino incompatível nunca vira match (gate eliminatório)", async () => {
    listAllActiveRadars.mockResolvedValue([{ ...RADAR_EMPRESA_1, origin_state: "RS" }]);
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    const resultado = await processarNovaOportunidade({} as never, OPORTUNIDADE as never);
    expect(resultado.matchesGerados).toBe(0);
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("match PARCIAL é criado mas não dispara notificação no WhatsApp (anti-spam — só FORTE avisa)", async () => {
    // destino e carroceria não confirmados derrubam o score pra faixa PARCIAL (40-69), sem eliminar o match (score = 55: 30 origem + 15 destino parcial + 0 carroceria + 10 data).
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    getVehicle.mockResolvedValue({ ...VEICULO, body_type: "bau" });
    createMatch.mockResolvedValue({ id: "match-1" });
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    const resultado = await processarNovaOportunidade({} as never, { ...OPORTUNIDADE, destination_state: null, body_type: "grade" } as never);
    expect(resultado.matchesGerados).toBe(1);
    expect(resultado.notificacoesEnviadas).toBe(0);
    expect(sendWhatsappText).not.toHaveBeenCalled();
  });

  it("match FORTE cria e notifica, sempre usando o WhatsApp da empresa DONA do radar (isolamento multiempresa)", async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue({ id: "match-1" });
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    const resultado = await processarNovaOportunidade({} as never, OPORTUNIDADE as never);
    expect(resultado.matchesGerados).toBe(1);
    expect(resultado.notificacoesEnviadas).toBe(1);
    expect(listChannelsForCompany).toHaveBeenCalledWith(expect.anything(), "empresa-1");
    expect(markMatchNotified).toHaveBeenCalledWith(expect.anything(), "match-1");
  });

  it("mesma oportunidade não gera 2º match pro mesmo radar (idempotência — createMatch devolve null em duplicata)", async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue(null);
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    const resultado = await processarNovaOportunidade({} as never, OPORTUNIDADE as never);
    expect(resultado.matchesGerados).toBe(0);
    expect(resultado.notificacoesEnviadas).toBe(0);
    expect(sendWhatsappText).not.toHaveBeenCalled();
  });

  it("sem canal WhatsApp cadastrado pra empresa, não conta como notificação enviada", async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue({ id: "match-1" });
    listChannelsForCompany.mockResolvedValue([]);
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    const resultado = await processarNovaOportunidade({} as never, OPORTUNIDADE as never);
    expect(resultado.notificacoesEnviadas).toBe(0);
    expect(markMatchNotified).not.toHaveBeenCalled();
  });

  it('modo "avisar_primeiro" (padrão) manda o texto sem custo/margem, mesmo com veículo elegível', async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue({ id: "match-1" });
    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    await processarNovaOportunidade({} as never, OPORTUNIDADE as never);
    expect(analisarFreteExecutar).not.toHaveBeenCalled();
    const texto = sendWhatsappText.mock.calls[0][1] as string;
    expect(texto).not.toContain("Custo estimado");
    expect(texto).toContain("Compatibilidade");
  });

  it('modo "analise_automatica" com dado suficiente manda custo/margem reais na notificação (nunca inventa)', async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue({ id: "match-1" });
    getOrCreatePreferences.mockResolvedValue({ freight_radar_analysis_mode: "analise_automatica" });
    getActiveCostProfile.mockResolvedValue({ fuel_price_per_liter: 6 });
    consultarRotaExecutar.mockResolvedValue({ sucesso: true, distanciaKm: 500 });
    calcularCombustivelExecutar.mockResolvedValue({ resultados: { custoTotalCombustivel: 800 } });
    analisarFreteExecutar.mockResolvedValue({
      mensagemResumo: "ok",
      freteAnalisado: { custoTotal: 800, margemPercentual: 25 },
    });
    startAnalysisRun.mockResolvedValue({ id: "run-1" });

    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    await processarNovaOportunidade({} as never, OPORTUNIDADE as never);

    expect(markMatchAnalyzed).toHaveBeenCalledWith(expect.anything(), "match-1", "empresa-1", "run-1");
    const texto = sendWhatsappText.mock.calls[0][1] as string;
    expect(texto).toContain("Custo estimado");
    expect(texto).toContain("Margem estimada: 25%");
  });

  it('modo "analise_automatica" SEM dado suficiente (custoTotal indefinido) nunca inventa número — cai no texto padrão explicando o motivo', async () => {
    listAllActiveRadars.mockResolvedValue([RADAR_EMPRESA_1]);
    createMatch.mockResolvedValue({ id: "match-1" });
    getOrCreatePreferences.mockResolvedValue({ freight_radar_analysis_mode: "analise_automatica" });
    getActiveCostProfile.mockResolvedValue(null); // sem perfil de custo => nunca chama calcular_combustivel
    consultarRotaExecutar.mockResolvedValue({ sucesso: true, distanciaKm: 500 });
    analisarFreteExecutar.mockResolvedValue({ mensagemResumo: "faltou dado", freteAnalisado: { custoTotal: undefined } });
    startAnalysisRun.mockResolvedValue({ id: "run-1" });

    const { processarNovaOportunidade } = await import("./radarMatchingEngine");
    await processarNovaOportunidade({} as never, OPORTUNIDADE as never);

    const texto = sendWhatsappText.mock.calls[0][1] as string;
    expect(texto).not.toContain("Custo estimado");
    expect(texto).toContain("não deu pra pré-analisar automaticamente");
  });
});

describe("analisarOportunidadeParaMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startAnalysisRun.mockResolvedValue({ id: "run-1" });
  });

  it("devolve null (nunca finge) quando a rota não pôde ser calculada", async () => {
    consultarRotaExecutar.mockResolvedValue({ sucesso: false });
    const { analisarOportunidadeParaMatch } = await import("./radarMatchingEngine");
    const resultado = await analisarOportunidadeParaMatch({} as never, "match-1", "empresa-1", OPORTUNIDADE as never, RADAR_EMPRESA_1 as never, VEICULO as never);
    expect(resultado).toBeNull();
    expect(failAnalysisRun).toHaveBeenCalled();
  });

  it("devolve null quando ferramentaAnalisarFrete conclui sem custoTotal (dado insuficiente)", async () => {
    consultarRotaExecutar.mockResolvedValue({ sucesso: true, distanciaKm: 500 });
    getActiveCostProfile.mockResolvedValue({ fuel_price_per_liter: 6 });
    calcularCombustivelExecutar.mockResolvedValue({ resultados: { custoTotalCombustivel: 800 } });
    analisarFreteExecutar.mockResolvedValue({ mensagemResumo: "sem dado", freteAnalisado: undefined });
    const { analisarOportunidadeParaMatch } = await import("./radarMatchingEngine");
    const resultado = await analisarOportunidadeParaMatch({} as never, "match-1", "empresa-1", OPORTUNIDADE as never, RADAR_EMPRESA_1 as never, VEICULO as never);
    expect(resultado).toBeNull();
  });

  it("devolve o custo/margem reais quando a análise conclui com dado suficiente", async () => {
    consultarRotaExecutar.mockResolvedValue({ sucesso: true, distanciaKm: 500 });
    getActiveCostProfile.mockResolvedValue({ fuel_price_per_liter: 6 });
    calcularCombustivelExecutar.mockResolvedValue({ resultados: { custoTotalCombustivel: 800 } });
    analisarFreteExecutar.mockResolvedValue({ mensagemResumo: "ok", freteAnalisado: { custoTotal: 800, margemPercentual: 25 } });
    const { analisarOportunidadeParaMatch } = await import("./radarMatchingEngine");
    const resultado = await analisarOportunidadeParaMatch({} as never, "match-1", "empresa-1", OPORTUNIDADE as never, RADAR_EMPRESA_1 as never, VEICULO as never);
    expect(resultado).toEqual({ custoTotal: 800, margemPercentual: 25 });
  });
});
