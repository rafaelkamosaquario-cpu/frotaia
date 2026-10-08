import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), subscription: vi.fn(), ai: vi.fn(), user: vi.fn(), modules: vi.fn() }));
vi.mock("@/services/supabase/companyModulesService", () => ({ readCompanyModules: m.modules }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.user } }) }));
vi.mock("@/ai/context/customerContext", () => ({ loadCustomerContext: m.context, loadVehicleContext: async () => ({}) }));
vi.mock("@/services/supabase/subscriptionService", async (original) => ({ ...await original<object>(), getSubscription: m.subscription }));
vi.mock("@/services/supabase/conversationService", () => ({ getOrCreateOpenConversation: async () => ({ id: "c", user_id: "u", company_id: "company" }), getConversationById: vi.fn() }));
vi.mock("@/ai/chat/gerarRespostaAssistente", () => ({ gerarRespostaAssistente: m.ai }));
import { POST } from "./route";
const request = () => new Request("https://test.local/api/chat", { method: "POST", body: JSON.stringify({ message: "oi" }) });
describe("web AI entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.modules.mockResolvedValue(null);
    m.user.mockResolvedValue({ data: { user: { id: "u" } } });
    m.context.mockResolvedValue({ company: { id: "company", fleet_panel_enabled: false }, profile: { is_admin: false } });
    m.ai.mockResolvedValue({ message: "ok" });
  });
  for (const subscription of [null, { status: "EXPIRADA", fleet_panel_included: true }, { status: "ATIVA", fleet_panel_included: false }, { status: "ATIVA", fleet_panel_included: true, valido_ate: "2020-01-01" }]) {
    it(`blocks ${JSON.stringify(subscription)} before AI`, async () => {
      m.subscription.mockResolvedValue(subscription);
      expect((await POST(request())).status).toBe(403);
      expect(m.ai).not.toHaveBeenCalled();
    });
  }
  it("allows an active panel subscription", async () => {
    m.subscription.mockResolvedValue({ status: "ATIVA", fleet_panel_included: true, valido_ate: null });
    expect((await POST(request())).status).toBe(200);
  });
  it("preserves existing manual panel grants", async () => {
    m.context.mockResolvedValue({ company: { id: "company", fleet_panel_enabled: true } });
    expect((await POST(request())).status).toBe(200);
    expect(m.subscription).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests", async () => {
    m.user.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(401);
    expect(m.ai).not.toHaveBeenCalled();
  });
  it("blocks a disabled assistant even when the company header is omitted", async () => {
    m.modules.mockResolvedValue({ enabled: ["frota"] });
    expect((await POST(request())).status).toBe(403);
    expect(m.ai).not.toHaveBeenCalled();
  });
  it("passes a restricted tool list to the web assistant", async () => {
    m.context.mockResolvedValue({ company: { id: "company", fleet_panel_enabled: true } });
    m.modules.mockResolvedValue({ enabled: ["frota", "assistente"] });
    expect((await POST(request())).status).toBe(200);
    const tools = m.ai.mock.calls[0][0].ferramentasPermitidas;
    expect(tools).toContain("gerenciar_veiculo");
    expect(tools).not.toContain("gerenciar_radar_frete");
    expect(tools).not.toContain("registrar_despesa");
  });
});
