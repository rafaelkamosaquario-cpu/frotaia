import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const getAlert = vi.fn();
const updateAlert = vi.fn();
const cancelAlert = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/supabase/alertService", async () => {
  const actual = await vi.importActual<typeof import("@/services/supabase/alertService")>("@/services/supabase/alertService");
  return {
    ...actual,
    getAlert: (...args: unknown[]) => getAlert(...args),
    updateAlert: (...args: unknown[]) => updateAlert(...args),
    cancelAlert: (...args: unknown[]) => cancelAlert(...args),
  };
});

function chamarPatch(id: string, body: unknown) {
  return async () => {
    const { PATCH } = await import("./route");
    return PATCH(new Request(`https://app.example.com/api/frota/alertas/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  };
}

function chamarDelete(id: string) {
  return async () => {
    const { DELETE } = await import("./route");
    return DELETE(new Request(`https://app.example.com/api/frota/alertas/${id}`, { method: "DELETE" }), { params: Promise.resolve({ id }) });
  };
}

const ALERTA_MANUAL = { id: "a1", maintenance_schedule_id: null, vehicle_document_id: null, vehicle_tire_id: null, category: null, status: "pending", title: "X" };
const ALERTA_MANUTENCAO = { id: "a2", maintenance_schedule_id: "m1", vehicle_document_id: null, vehicle_tire_id: null, category: "manutencao", status: "pending", title: "Y" };

describe("/api/frota/alertas/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  describe("PATCH", () => {
    it("404 quando o alerta não existe (ou é de outra empresa)", async () => {
      getAlert.mockResolvedValue(null);
      const resposta = await chamarPatch("a1", { title: "Novo título" })();
      expect(resposta.status).toBe(404);
      expect(updateAlert).not.toHaveBeenCalled();
    });

    it("409 ao tentar editar alerta de origem automática (manutenção) — nunca deixa dessincronizar", async () => {
      getAlert.mockResolvedValue(ALERTA_MANUTENCAO);
      const resposta = await chamarPatch("a2", { title: "Tentando editar" })();
      expect(resposta.status).toBe(409);
      expect(updateAlert).not.toHaveBeenCalled();
    });

    it("200 edita alerta manual normalmente", async () => {
      getAlert.mockResolvedValue(ALERTA_MANUAL);
      updateAlert.mockResolvedValue({ ...ALERTA_MANUAL, title: "Novo título" });
      const resposta = await chamarPatch("a1", { title: "Novo título" })();
      expect(resposta.status).toBe(200);
      expect(updateAlert).toHaveBeenCalledWith(expect.anything(), "a1", "empresa-1", expect.objectContaining({ title: "Novo título" }));
    });
  });

  describe("DELETE (cancelamento — nunca exclusão física)", () => {
    it("409 ao tentar cancelar alerta de manutenção pelo painel", async () => {
      getAlert.mockResolvedValue(ALERTA_MANUTENCAO);
      const resposta = await chamarDelete("a2")();
      expect(resposta.status).toBe(409);
      expect(cancelAlert).not.toHaveBeenCalled();
    });

    it("409 ao tentar cancelar alerta que já não está pendente", async () => {
      getAlert.mockResolvedValue({ ...ALERTA_MANUAL, status: "sent" });
      const resposta = await chamarDelete("a1")();
      expect(resposta.status).toBe(409);
      expect(cancelAlert).not.toHaveBeenCalled();
    });

    it("200 cancela alerta manual pendente (soft — status vira cancelled, sem DELETE físico)", async () => {
      getAlert.mockResolvedValue(ALERTA_MANUAL);
      cancelAlert.mockResolvedValue(undefined);
      const resposta = await chamarDelete("a1")();
      expect(resposta.status).toBe(200);
      expect(cancelAlert).toHaveBeenCalledWith(expect.anything(), "a1", "empresa-1");
    });
  });

  it("401 sem sessão, em nenhum dos dois métodos", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    expect((await chamarPatch("a1", {})()).status).toBe(401);
    expect((await chamarDelete("a1")()).status).toBe(401);
    expect(getAlert).not.toHaveBeenCalled();
  });
});
