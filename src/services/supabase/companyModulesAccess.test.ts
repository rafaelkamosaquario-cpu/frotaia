import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachPanelPath } from "@/lib/frota/companyScope";
const m = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), modules: vi.fn() }));
vi.mock("@/ai/context/customerContext", () => ({ loadCustomerContext: m.context }));
vi.mock("./subscriptionService", () => ({ getSubscription: async () => null, isFleetPanelAccessAllowed: () => false }));
vi.mock("./companyModulesService", () => ({ readCompanyModules: m.modules }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { loadFleetPanelAccess } from "./fleetPanelAccess";
const client = { auth: { getUser: m.user } };
beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ data: { user: { id: "user" } } });
  m.context.mockResolvedValue({ company: { id: "tenant-a", fleet_panel_enabled: true }, role: "owner" });
  m.modules.mockResolvedValue({ enabled: ["frota"], company_id: "tenant-a" });
});
describe("server company module gate", () => {
  it("rejects disabled API without trusting client membership claims", async () => {
    attachPanelPath(client, "/api/frota/oportunidades/123");
    expect(await loadFleetPanelAccess(client as never)).toEqual({ ok: false, reason: "not_entitled" });
    expect(m.modules).toHaveBeenCalledWith("tenant-a");
  });
  it("redirects disabled direct page access", async () => {
    attachPanelPath(client, "/frota/oportunidades");
    await expect(loadFleetPanelAccess(client as never)).rejects.toThrow("redirect:/frota/dashboard");
  });
  it("allows enabled modules and preserves consultant access", async () => {
    attachPanelPath(client, "/api/frota/veiculos");
    expect((await loadFleetPanelAccess(client as never)).ok).toBe(true);
    attachPanelPath(client, "/api/frota/oportunidades");
    m.user.mockResolvedValue({ data: { user: { id: "consultant", email: "rafaelkamosaquario@gmail.com", email_confirmed_at: "2026-01-01" } } });
    expect((await loadFleetPanelAccess(client as never)).ok).toBe(true);
  });
  it("does not grant consultant access to an unrelated company", async () => {
    m.context.mockResolvedValue({ company: null });
    expect((await loadFleetPanelAccess(client as never)).ok).toBe(false);
    expect(m.modules).not.toHaveBeenCalled();
  });
  it("fails closed on configuration read errors", async () => {
    m.modules.mockRejectedValue(new Error("database unavailable"));
    await expect(loadFleetPanelAccess(client as never)).rejects.toThrow("database unavailable");
  });
});
