import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), subscription: vi.fn(), ai: vi.fn(), user: vi.fn() }));
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
});
