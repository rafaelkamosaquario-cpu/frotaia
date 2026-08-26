import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const listGeneratedDocuments = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...a: unknown[]) => loadFleetPanelAccess(...a) }));
vi.mock("@/services/supabase/generatedDocumentService", () => ({ listGeneratedDocuments: (...a: unknown[]) => listGeneratedDocuments(...a) }));

function chamarGet(url = "https://app.example.com/api/frota/documentos-gerados") {
  return async () => {
    const { GET } = await import("./route");
    return GET(new Request(url));
  };
}

describe("/api/frota/documentos-gerados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  it("401 sem sessão", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const resposta = await chamarGet()();
    expect(resposta.status).toBe(401);
    expect(listGeneratedDocuments).not.toHaveBeenCalled();
  });

  it("busca sempre filtrada pela empresa da sessão (isolamento multiempresa)", async () => {
    listGeneratedDocuments.mockResolvedValue({ itens: [], total: 0 });
    await chamarGet()();
    expect(listGeneratedDocuments).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId: "empresa-1" }));
  });

  it("devolve a lista e o total", async () => {
    listGeneratedDocuments.mockResolvedValue({ itens: [{ id: "doc-1" }], total: 1 });
    const resposta = await chamarGet()();
    const data = await resposta.json();
    expect(data.documentos).toEqual([{ id: "doc-1" }]);
    expect(data.total).toBe(1);
  });

  it("repassa o parâmetro de busca da query string", async () => {
    listGeneratedDocuments.mockResolvedValue({ itens: [], total: 0 });
    await chamarGet("https://app.example.com/api/frota/documentos-gerados?busca=relatorio")();
    expect(listGeneratedDocuments).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ buscaTexto: "relatorio" }));
  });
});
