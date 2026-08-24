import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();

class FakeGoogleCalendarNotConnectedError extends Error {}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/google/googleCalendarService", () => ({
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
  GoogleCalendarNotConnectedError: FakeGoogleCalendarNotConnectedError,
}));

function chamarPatch(eventId: string, body: unknown) {
  return async () => {
    const { PATCH } = await import("./route");
    return PATCH(new Request(`https://app.example.com/api/frota/agenda/${eventId}`, { method: "PATCH", body: JSON.stringify(body) }), {
      params: Promise.resolve({ eventId }),
    });
  };
}

function chamarDelete(eventId: string) {
  return async () => {
    const { DELETE } = await import("./route");
    return DELETE(new Request(`https://app.example.com/api/frota/agenda/${eventId}`, { method: "DELETE" }), { params: Promise.resolve({ eventId }) });
  };
}

describe("/api/frota/agenda/[eventId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
  });

  it("PATCH atualiza o evento e passa userId/companyId/eventId corretos", async () => {
    updateEvent.mockResolvedValue({ id: "ev1", summary: "Revisão adiada" });
    const resposta = await chamarPatch("ev1", { title: "Revisão adiada" })();
    const data = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(data.evento.summary).toBe("Revisão adiada");
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", companyId: "empresa-1", eventId: "ev1", title: "Revisão adiada" }));
  });

  it("DELETE só chega na rota depois da confirmação já ter acontecido na UI — aqui só executa", async () => {
    deleteEvent.mockResolvedValue(undefined);
    const resposta = await chamarDelete("ev1")();
    expect(resposta.status).toBe(200);
    expect(deleteEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", companyId: "empresa-1", eventId: "ev1" }));
  });

  it("PATCH devolve 409 se o Calendar for desconectado no meio do caminho", async () => {
    updateEvent.mockRejectedValue(new FakeGoogleCalendarNotConnectedError());
    const resposta = await chamarPatch("ev1", { title: "X" })();
    expect(resposta.status).toBe(409);
  });

  it("401 sem sessão, nem chama o service", async () => {
    loadFleetPanelAccess.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    const resposta = await chamarDelete("ev1")();
    expect(resposta.status).toBe(401);
    expect(deleteEvent).not.toHaveBeenCalled();
  });
});
