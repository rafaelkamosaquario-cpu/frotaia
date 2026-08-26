import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const getGuideState = vi.fn();
const saveGuideState = vi.fn();
const markGuideOffered = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...a: unknown[]) => loadFleetPanelAccess(...a) }));
vi.mock("@/services/supabase/companyPreferencesService", () => ({
  getGuideState: (...a: unknown[]) => getGuideState(...a),
  saveGuideState: (...a: unknown[]) => saveGuideState(...a),
  markGuideOffered: (...a: unknown[]) => markGuideOffered(...a),
}));

function chamarGet() {
  return async () => {
    const { GET } = await import("./route");
    return GET();
  };
}

function chamarPost(body: unknown) {
  return async () => {
    const { POST } = await import("./route");
    return POST(new Request("https://app.example.com/api/frota/guide-v2", { method: "POST", body: JSON.stringify(body) }));
  };
}

describe("/api/frota/guide-v2 — estado do tour V2 (08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
    getGuideState.mockResolvedValue({ status: "not_started", step: null, offeredAt: null });
    saveGuideState.mockResolvedValue(undefined);
    markGuideOffered.mockResolvedValue(undefined);
  });

  describe("GET", () => {
    it("401 sem sessão", async () => {
      loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
      const resposta = await chamarGet()();
      expect(resposta.status).toBe(401);
      expect(getGuideState).not.toHaveBeenCalled();
    });

    it("403 sem entitlement Gestão", async () => {
      loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "not_entitled" });
      const resposta = await chamarGet()();
      expect(resposta.status).toBe(403);
    });

    it("devolve o estado atual, sempre da empresa da sessão", async () => {
      getGuideState.mockResolvedValue({ status: "in_progress", step: "frota", offeredAt: "2026-08-01T00:00:00.000Z" });
      const resposta = await chamarGet()();
      const data = await resposta.json();
      expect(data).toEqual({ status: "in_progress", step: "frota", offeredAt: "2026-08-01T00:00:00.000Z" });
      expect(getGuideState).toHaveBeenCalledWith(expect.anything(), "empresa-1", "v2");
    });
  });

  describe("POST", () => {
    it("401 sem sessão", async () => {
      loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
      const resposta = await chamarPost({ status: "in_progress", step: "dashboard" })();
      expect(resposta.status).toBe(401);
      expect(saveGuideState).not.toHaveBeenCalled();
    });

    it("400 com status inválido — nunca grava estado inválido no banco", async () => {
      const resposta = await chamarPost({ status: "qualquer_coisa" })();
      expect(resposta.status).toBe(400);
      expect(saveGuideState).not.toHaveBeenCalled();
    });

    it("400 com corpo vazio/inválido", async () => {
      const resposta = await (async () => {
        const { POST } = await import("./route");
        return POST(new Request("https://app.example.com/api/frota/guide-v2", { method: "POST", body: "não é json" }));
      })();
      expect(resposta.status).toBe(400);
    });

    it("persiste status/step válidos, sempre pra empresa da sessão", async () => {
      await chamarPost({ status: "in_progress", step: "frota" })();
      expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), "empresa-1", "v2", { status: "in_progress", step: "frota" });
    });

    it("step null é aceito (conclusão/dismiss)", async () => {
      await chamarPost({ status: "completed", step: null })();
      expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), "empresa-1", "v2", { status: "completed", step: null });
    });

    it("markOffered marca a oferta única quando pedido", async () => {
      await chamarPost({ markOffered: true })();
      expect(markGuideOffered).toHaveBeenCalledWith(expect.anything(), "empresa-1", "v2");
      expect(saveGuideState).not.toHaveBeenCalled(); // markOffered sozinho não muda status/step
    });

    it("sem status nem markOffered: não grava nada, só devolve o estado atual", async () => {
      await chamarPost({})();
      expect(saveGuideState).not.toHaveBeenCalled();
      expect(markGuideOffered).not.toHaveBeenCalled();
      expect(getGuideState).toHaveBeenCalled();
    });

    it("devolve o estado já atualizado depois de gravar", async () => {
      getGuideState.mockResolvedValue({ status: "in_progress", step: "dashboard", offeredAt: null });
      const resposta = await chamarPost({ status: "in_progress", step: "dashboard" })();
      const data = await resposta.json();
      expect(data.status).toBe("in_progress");
      expect(data.step).toBe("dashboard");
    });
  });
});
