import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const isGoogleMapsConfigured = vi.fn();
const geocodificarEndereco = vi.fn();
const calcularRota = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/lib/google/mapsConfig", () => ({ isGoogleMapsConfigured: () => isGoogleMapsConfigured() }));
vi.mock("@/lib/google/mapsClient", () => ({
  geocodificarEndereco: (...args: unknown[]) => geocodificarEndereco(...args),
  calcularRota: (...args: unknown[]) => calcularRota(...args),
}));

function chamar(body: unknown) {
  return async () => {
    const { POST } = await import("./route");
    return POST(new Request("https://app.example.com/api/frota/rotas/calcular", { method: "POST", body: JSON.stringify(body) }));
  };
}

describe("POST /api/frota/rotas/calcular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
    isGoogleMapsConfigured.mockReturnValue(true);
  });

  it("403 sem acesso ao painel", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "not_entitled" });
    const resposta = await chamar({ origem: "Curitiba", destino: "São Paulo" })();
    expect(resposta.status).toBe(403);
    expect(geocodificarEndereco).not.toHaveBeenCalled();
  });

  it("503 quando o Google Maps não está configurado — nunca inventa distância", async () => {
    isGoogleMapsConfigured.mockReturnValue(false);
    const resposta = await chamar({ origem: "Curitiba", destino: "São Paulo" })();
    expect(resposta.status).toBe(503);
    expect(geocodificarEndereco).not.toHaveBeenCalled();
  });

  it("400 quando falta origem ou destino", async () => {
    const resposta = await chamar({ origem: "Curitiba" })();
    expect(resposta.status).toBe(400);
  });

  it("422 quando um dos endereços não é encontrado", async () => {
    geocodificarEndereco.mockResolvedValueOnce({ latitude: 1, longitude: 2, enderecoFormatado: "Curitiba, PR" }).mockResolvedValueOnce(null);
    const resposta = await chamar({ origem: "Curitiba", destino: "Endereço Inexistente Xyz" })();
    expect(resposta.status).toBe(422);
    expect(calcularRota).not.toHaveBeenCalled();
  });

  it("200 com distância/duração arredondadas quando os dois endereços são encontrados", async () => {
    geocodificarEndereco
      .mockResolvedValueOnce({ latitude: -25.4, longitude: -49.2, enderecoFormatado: "Curitiba, PR" })
      .mockResolvedValueOnce({ latitude: -23.5, longitude: -46.6, enderecoFormatado: "São Paulo, SP" });
    calcularRota.mockResolvedValue({ distanciaMetros: 408300, duracaoSegundos: 24000 });

    const resposta = await chamar({ origem: "Curitiba", destino: "São Paulo" })();
    const data = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(data.distanciaKm).toBe(408.3);
    expect(data.duracaoMinutos).toBe(400);
  });

  it("502 quando a API do Google falha (nunca deixa o erro cru vazar)", async () => {
    geocodificarEndereco.mockRejectedValue(new Error("timeout"));
    const resposta = await chamar({ origem: "Curitiba", destino: "São Paulo" })();
    expect(resposta.status).toBe(502);
  });
});
