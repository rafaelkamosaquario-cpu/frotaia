import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const getMatch = vi.fn();
const updateMatchStatus = vi.fn();
const getOpportunity = vi.fn();
const getVehicle = vi.fn();
const listRadarsForCompany = vi.fn();
const analisarOportunidadeParaMatch = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/supabase/freightMatchService", () => ({
  getMatch: (...args: unknown[]) => getMatch(...args),
  updateMatchStatus: (...args: unknown[]) => updateMatchStatus(...args),
}));
vi.mock("@/services/supabase/freightOpportunityService", () => ({ getOpportunity: (...args: unknown[]) => getOpportunity(...args) }));
vi.mock("@/services/supabase/vehicleService", () => ({ getVehicle: (...args: unknown[]) => getVehicle(...args) }));
vi.mock("@/services/supabase/freightRadarService", () => ({ listRadarsForCompany: (...args: unknown[]) => listRadarsForCompany(...args) }));
vi.mock("@/services/freight/radarMatchingEngine", () => ({ analisarOportunidadeParaMatch: (...args: unknown[]) => analisarOportunidadeParaMatch(...args) }));

function chamarPatch(matchId: string, body: unknown) {
  return async () => {
    const { PATCH } = await import("./route");
    return PATCH(new Request(`https://app.example.com/api/frota/oportunidades/${matchId}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ matchId }) });
  };
}

const MATCH_COM_VEICULO = { id: "match-1", company_id: "empresa-1", radar_id: "radar-1", vehicle_id: "veiculo-1", opportunity_id: "oportunidade-1", status: "notified" };
const OPORTUNIDADE = { id: "oportunidade-1", origin_city: "Curitiba" };
const VEICULO = { id: "veiculo-1" };
const RADAR = { id: "radar-1", company_id: "empresa-1" };

describe("/api/frota/oportunidades/[matchId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  it("401 sem sessão", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const resposta = await chamarPatch("match-1", { status: "favorited" })();
    expect(resposta.status).toBe(401);
  });

  it("busca o match sempre filtrado pela empresa da sessão (isolamento multiempresa) e nunca por um companyId vindo do body", async () => {
    getMatch.mockResolvedValue(null);
    await chamarPatch("match-1", { acao: "analisar", companyId: "empresa-invasora" })();
    expect(getMatch).toHaveBeenCalledWith(expect.anything(), "match-1", "empresa-1");
  });

  it("404 ao analisar oportunidade que não existe (ou é de outra empresa)", async () => {
    getMatch.mockResolvedValue(null);
    const resposta = await chamarPatch("match-1", { acao: "analisar" })();
    expect(resposta.status).toBe(404);
    expect(analisarOportunidadeParaMatch).not.toHaveBeenCalled();
  });

  it("422 ao analisar match sem veículo associado (radar sem veículo)", async () => {
    getMatch.mockResolvedValue({ ...MATCH_COM_VEICULO, vehicle_id: null });
    const resposta = await chamarPatch("match-1", { acao: "analisar" })();
    expect(resposta.status).toBe(422);
    expect(analisarOportunidadeParaMatch).not.toHaveBeenCalled();
  });

  it("devolve a pré-análise real no corpo da resposta — reaproveitando a MESMA função que a IA usa automaticamente, nunca um segundo cálculo", async () => {
    getMatch
      .mockResolvedValueOnce(MATCH_COM_VEICULO) // primeira chamada (busca antes de analisar)
      .mockResolvedValueOnce({ ...MATCH_COM_VEICULO, status: "analyzed" }); // segunda chamada (busca depois de analisar)
    getOpportunity.mockResolvedValue(OPORTUNIDADE);
    getVehicle.mockResolvedValue(VEICULO);
    listRadarsForCompany.mockResolvedValue([RADAR]);
    analisarOportunidadeParaMatch.mockResolvedValue({ custoTotal: 800, margemPercentual: 25 });

    const resposta = await chamarPatch("match-1", { acao: "analisar" })();
    const data = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(data.preAnalise).toEqual({ custoTotal: 800, margemPercentual: 25 });
    expect(data.match.status).toBe("analyzed");
  });

  it("devolve preAnalise=null (nunca inventa) quando a pré-análise não teve dado suficiente", async () => {
    getMatch.mockResolvedValue(MATCH_COM_VEICULO);
    getOpportunity.mockResolvedValue(OPORTUNIDADE);
    getVehicle.mockResolvedValue(VEICULO);
    listRadarsForCompany.mockResolvedValue([RADAR]);
    analisarOportunidadeParaMatch.mockResolvedValue(null);

    const resposta = await chamarPatch("match-1", { acao: "analisar" })();
    const data = await resposta.json();
    expect(data.preAnalise).toBeNull();
  });

  it("400 quando status não é um dos valores aceitos", async () => {
    const resposta = await chamarPatch("match-1", { status: "lido" })();
    expect(resposta.status).toBe(400);
    expect(updateMatchStatus).not.toHaveBeenCalled();
  });

  it("favoritar/ignorar chamam updateMatchStatus com o status pedido", async () => {
    updateMatchStatus.mockResolvedValue({ ...MATCH_COM_VEICULO, status: "favorited" });
    const resposta = await chamarPatch("match-1", { status: "favorited" })();
    expect(resposta.status).toBe(200);
    expect(updateMatchStatus).toHaveBeenCalledWith(expect.anything(), "match-1", "empresa-1", "favorited");
  });
});
