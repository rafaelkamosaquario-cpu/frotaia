import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const loadFleetPanelAccess = vi.fn();
const getOrCreatePreferences = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: (...args: unknown[]) => loadFleetPanelAccess(...args) }));
vi.mock("@/services/supabase/companyPreferencesService", () => ({
  getOrCreatePreferences: (...args: unknown[]) => getOrCreatePreferences(...args),
  updatePreferences: (...args: unknown[]) => updatePreferences(...args),
}));
vi.mock("@/services/supabase/checklistDispatchService", () => ({ CHECKLIST_ITEM_LABELS: { oleo: "Óleo", agua: "Água", pneus: "Pneus", luzes: "Luzes" } }));

function chamar(body: unknown) {
  return async () => {
    const { PATCH } = await import("./route");
    return PATCH(new Request("https://app.example.com/api/frota/configuracoes", { method: "PATCH", body: JSON.stringify(body) }));
  };
}

describe("PATCH /api/frota/configuracoes — memória da IA (evolução funcional 08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadFleetPanelAccess.mockResolvedValue({ ok: true, company: { id: "empresa-1" }, userId: "user-1" });
    getOrCreatePreferences.mockResolvedValue({});
    updatePreferences.mockResolvedValue({ ask_before_saving_memory: true, allow_automatic_memory: false });
  });

  it("aceita askBeforeSavingMemory/allowAutomaticMemory booleanos", async () => {
    const resposta = await chamar({ askBeforeSavingMemory: true, allowAutomaticMemory: false })();
    expect(resposta.status).toBe(200);
    expect(updatePreferences).toHaveBeenCalledWith(expect.anything(), "empresa-1", "user-1", { askBeforeSavingMemory: true, allowAutomaticMemory: false });
  });

  it("rejeita askBeforeSavingMemory não-booleano com 400 (nunca chega no service)", async () => {
    const resposta = await chamar({ askBeforeSavingMemory: "sim" })();
    expect(resposta.status).toBe(400);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("rejeita allowAutomaticMemory não-booleano com 400", async () => {
    const resposta = await chamar({ allowAutomaticMemory: "nao" })();
    expect(resposta.status).toBe(400);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("continua aceitando payload sem os campos novos (compatibilidade com o resto da tela)", async () => {
    const resposta = await chamar({ preferredResponseStyle: "simples" })();
    expect(resposta.status).toBe(200);
  });
});
