import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const listUpcomingEvents = vi.fn();
const createEvent = vi.fn();

class FakeGoogleCalendarNotConnectedError extends Error {}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/google/googleCalendarService", () => ({
  listUpcomingEvents: (...args: unknown[]) => listUpcomingEvents(...args),
  createEvent: (...args: unknown[]) => createEvent(...args),
  GoogleCalendarNotConnectedError: FakeGoogleCalendarNotConnectedError,
}));

function chamarGet(url: string) {
  return async () => {
    const { GET } = await import("./route");
    return GET(new Request(url));
  };
}

function chamarPost(body: unknown) {
  return async () => {
    const { POST } = await import("./route");
    return POST(new Request("https://app.example.com/api/frota/agenda", { method: "POST", body: JSON.stringify(body) }));
  };
}

describe("/api/frota/agenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  describe("GET", () => {
    it("401 sem sessão", async () => {
      loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
      const resposta = await chamarGet("https://app.example.com/api/frota/agenda")();
      expect(resposta.status).toBe(401);
    });

    it("200 devolve os eventos do Google Calendar (fonte única, sem tabela local)", async () => {
      listUpcomingEvents.mockResolvedValue({ items: [{ id: "ev1", summary: "Revisão" }], calendarId: "primary" });
      const resposta = await chamarGet("https://app.example.com/api/frota/agenda?from=2026-08-01&to=2026-08-31")();
      const data = await resposta.json();
      expect(resposta.status).toBe(200);
      expect(data.eventos).toEqual([{ id: "ev1", summary: "Revisão" }]);
      expect(listUpcomingEvents).toHaveBeenCalledWith(expect.objectContaining({ companyId: "empresa-1", from: "2026-08-01", to: "2026-08-31" }));
    });

    it("409 quando o Calendar não está conectado (nunca deixa o erro cru vazar)", async () => {
      listUpcomingEvents.mockRejectedValue(new FakeGoogleCalendarNotConnectedError("não conectado"));
      const resposta = await chamarGet("https://app.example.com/api/frota/agenda")();
      expect(resposta.status).toBe(409);
    });
  });

  describe("POST", () => {
    it("400 sem título/início/fim", async () => {
      const resposta = await chamarPost({ title: "Revisão" })();
      expect(resposta.status).toBe(400);
      expect(createEvent).not.toHaveBeenCalled();
    });

    it("201 cria evento com timezone fixo America/Sao_Paulo", async () => {
      createEvent.mockResolvedValue({ id: "ev2", summary: "Revisão" });
      const resposta = await chamarPost({ title: "Revisão", startIso: "2026-08-25T08:00:00", endIso: "2026-08-25T09:00:00" })();
      expect(resposta.status).toBe(201);
      expect(createEvent).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", companyId: "empresa-1", title: "Revisão", timezone: "America/Sao_Paulo" })
      );
    });
  });
});
