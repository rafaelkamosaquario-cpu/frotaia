import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const createAlert = vi.fn();
const listAlertsForPanel = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/supabase/alertService", async () => {
  const actual = await vi.importActual<typeof import("@/services/supabase/alertService")>("@/services/supabase/alertService");
  return {
    ...actual,
    createAlert: (...args: unknown[]) => createAlert(...args),
    listAlertsForPanel: (...args: unknown[]) => listAlertsForPanel(...args),
  };
});

function chamarGet(url: string) {
  return async () => {
    const { GET } = await import("./route");
    return GET(new Request(url));
  };
}

function chamarPost(body: unknown) {
  return async () => {
    const { POST } = await import("./route");
    return POST(new Request("https://app.example.com/api/frota/alertas", { method: "POST", body: JSON.stringify(body) }));
  };
}

const ALERTA_MANUAL = { id: "a1", maintenance_schedule_id: null, vehicle_document_id: null, category: null, status: "pending" };
const ALERTA_MANUTENCAO = { id: "a2", maintenance_schedule_id: "m1", vehicle_document_id: null, category: "manutencao", status: "pending" };
const ALERTA_CHECKLIST = { id: "a3", maintenance_schedule_id: null, vehicle_document_id: null, category: "checklist", status: "pending" };

describe("/api/frota/alertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  describe("GET", () => {
    it("401 sem sessão", async () => {
      loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
      const resposta = await chamarGet("https://app.example.com/api/frota/alertas")();
      expect(resposta.status).toBe(401);
    });

    it("devolve todos os alertas sem filtro de origem", async () => {
      listAlertsForPanel.mockResolvedValue([ALERTA_MANUAL, ALERTA_MANUTENCAO, ALERTA_CHECKLIST]);
      const resposta = await chamarGet("https://app.example.com/api/frota/alertas")();
      const data = await resposta.json();
      expect(data.alertas).toHaveLength(3);
    });

    it("filtra por origem=manual em memória (nunca confia só em category)", async () => {
      listAlertsForPanel.mockResolvedValue([ALERTA_MANUAL, ALERTA_MANUTENCAO, ALERTA_CHECKLIST]);
      const resposta = await chamarGet("https://app.example.com/api/frota/alertas?origem=manual")();
      const data = await resposta.json();
      expect(data.alertas).toEqual([ALERTA_MANUAL]);
    });

    it("filtra por origem=manutencao", async () => {
      listAlertsForPanel.mockResolvedValue([ALERTA_MANUAL, ALERTA_MANUTENCAO, ALERTA_CHECKLIST]);
      const resposta = await chamarGet("https://app.example.com/api/frota/alertas?origem=manutencao")();
      const data = await resposta.json();
      expect(data.alertas).toEqual([ALERTA_MANUTENCAO]);
    });

    it("origem inválida é ignorada (devolve tudo, não quebra)", async () => {
      listAlertsForPanel.mockResolvedValue([ALERTA_MANUAL]);
      const resposta = await chamarGet("https://app.example.com/api/frota/alertas?origem=lixo")();
      const data = await resposta.json();
      expect(data.alertas).toEqual([ALERTA_MANUAL]);
    });
  });

  describe("POST", () => {
    it("400 sem título/data", async () => {
      const resposta = await chamarPost({ title: "Ligar pro mecânico" })();
      expect(resposta.status).toBe(400);
      expect(createAlert).not.toHaveBeenCalled();
    });

    it("201 cria alerta manual com companyId/userId do contexto (nunca do body)", async () => {
      createAlert.mockResolvedValue({ ...ALERTA_MANUAL, title: "Ligar pro mecânico" });
      const resposta = await chamarPost({ title: "Ligar pro mecânico", scheduledFor: "2026-08-25T08:00:00-03:00", companyId: "empresa-invasora" })();
      expect(resposta.status).toBe(201);
      expect(createAlert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId: "empresa-1", userId: "user-1", title: "Ligar pro mecânico" }));
    });

    it("400 quando scheduledFor não é absoluto (sem offset)", async () => {
      const resposta = await chamarPost({ title: "X", scheduledFor: "2026-08-25T08:00:00" })();
      expect(resposta.status).toBe(400);
      expect(createAlert).not.toHaveBeenCalled();
    });

    it("403 quando a RLS rejeita por falta de papel (owner/admin/operator)", async () => {
      const erroRls = Object.assign(new Error("permission denied"), { code: "42501" });
      createAlert.mockRejectedValue(erroRls);
      const resposta = await chamarPost({ title: "X", scheduledFor: "2026-08-25T08:00:00-03:00" })();
      expect(resposta.status).toBe(403);
    });
  });
});
