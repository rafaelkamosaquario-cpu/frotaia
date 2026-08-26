import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const getGeneratedDocument = vi.fn();
const createSignedGeneratedDocumentUrl = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...a: unknown[]) => loadFleetPanelAccess(...a) }));
vi.mock("@/services/supabase/generatedDocumentService", () => ({ getGeneratedDocument: (...a: unknown[]) => getGeneratedDocument(...a) }));
vi.mock("@/lib/storage/generatedDocumentsStorage", () => ({
  createSignedGeneratedDocumentUrl: (...a: unknown[]) => createSignedGeneratedDocumentUrl(...a),
}));

function chamarGet(id: string) {
  return async () => {
    const { GET } = await import("./route");
    return GET(new Request(`https://app.example.com/api/frota/documentos-gerados/${id}/arquivo`), { params: Promise.resolve({ id }) });
  };
}

describe("/api/frota/documentos-gerados/[id]/arquivo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  it("401 sem sessão", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const resposta = await chamarGet("doc-1")();
    expect(resposta.status).toBe(401);
  });

  it("404 quando o documento não existe (ou é de outra empresa — busca sempre filtra por company_id)", async () => {
    getGeneratedDocument.mockResolvedValue(null);
    const resposta = await chamarGet("doc-1")();
    expect(resposta.status).toBe(404);
    expect(getGeneratedDocument).toHaveBeenCalledWith(expect.anything(), "doc-1", "empresa-1");
    expect(createSignedGeneratedDocumentUrl).not.toHaveBeenCalled();
  });

  it("404 quando o documento existe mas nunca teve arquivo persistido (storage_path nulo)", async () => {
    getGeneratedDocument.mockResolvedValue({ id: "doc-1", storage_path: null, file_name: "x.pdf" });
    const resposta = await chamarGet("doc-1")();
    expect(resposta.status).toBe(404);
    expect(createSignedGeneratedDocumentUrl).not.toHaveBeenCalled();
  });

  it("200 com a signed URL quando o documento tem arquivo", async () => {
    getGeneratedDocument.mockResolvedValue({ id: "doc-1", storage_path: "empresa-1/generated/x.pdf", file_name: "relatorio.pdf" });
    createSignedGeneratedDocumentUrl.mockResolvedValue("https://signed.example.com/x");

    const resposta = await chamarGet("doc-1")();
    const data = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(data.url).toBe("https://signed.example.com/x");
    expect(createSignedGeneratedDocumentUrl).toHaveBeenCalledWith(expect.anything(), "empresa-1/generated/x.pdf", "relatorio.pdf");
  });
});
