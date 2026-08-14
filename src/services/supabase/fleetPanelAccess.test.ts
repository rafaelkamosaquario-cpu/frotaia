import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompanyRow, SubscriptionRow } from "@/lib/supabase/tables";

const loadCustomerContext = vi.fn();
const getSubscription = vi.fn();

vi.mock("@/ai/context/customerContext", () => ({
  loadCustomerContext: (...args: unknown[]) => loadCustomerContext(...args),
}));

vi.mock("./subscriptionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./subscriptionService")>();
  return { ...actual, getSubscription: (...args: unknown[]) => getSubscription(...args) };
});

function fakeClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never;
}

function fakeCompany(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return { id: "company-1", name: "Transportes Teste", fleet_panel_enabled: false, ...overrides } as CompanyRow;
}

function fakeSubscription(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: "sub-1",
    company_id: "company-1",
    plan: "MENSAL",
    status: "ATIVA",
    valido_ate: null,
    fleet_panel_included: false,
    ...overrides,
  } as SubscriptionRow;
}

describe("loadFleetPanelAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSubscription.mockResolvedValue(null);
  });

  it("retorna unauthenticated quando não há usuário logado, sem chamar loadCustomerContext", async () => {
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient(null));

    expect(resultado).toEqual({ ok: false, reason: "unauthenticated" });
    expect(loadCustomerContext).not.toHaveBeenCalled();
  });

  it("retorna no_company quando o usuário não tem empresa default", async () => {
    loadCustomerContext.mockResolvedValue({ profile: null, company: null, role: null, preferences: null });
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: false, reason: "no_company" });
  });

  it("retorna not_entitled quando nem fleet_panel_enabled nem a assinatura liberam", async () => {
    loadCustomerContext.mockResolvedValue({
      profile: null,
      company: fakeCompany({ fleet_panel_enabled: false }),
      role: "owner",
      preferences: null,
    });
    getSubscription.mockResolvedValue(fakeSubscription({ fleet_panel_included: false }));
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: false, reason: "not_entitled" });
  });

  it("retorna ok=true com empresa e role quando fleet_panel_enabled é true (fonte legada)", async () => {
    const company = fakeCompany({ fleet_panel_enabled: true });
    loadCustomerContext.mockResolvedValue({ profile: null, company, role: "owner", preferences: null });
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: true, userId: "user-1", company, role: "owner" });
  });

  it("retorna ok=true quando fleet_panel_enabled é false mas a assinatura tem fleet_panel_included (fonte nova, Fase 15)", async () => {
    const company = fakeCompany({ fleet_panel_enabled: false });
    loadCustomerContext.mockResolvedValue({ profile: null, company, role: "admin", preferences: null });
    getSubscription.mockResolvedValue(fakeSubscription({ status: "ATIVA", fleet_panel_included: true }));
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: true, userId: "user-1", company, role: "admin" });
  });

  it("retorna not_entitled quando fleet_panel_included é true mas a assinatura está cancelada", async () => {
    const company = fakeCompany({ fleet_panel_enabled: false });
    loadCustomerContext.mockResolvedValue({ profile: null, company, role: "owner", preferences: null });
    getSubscription.mockResolvedValue(fakeSubscription({ status: "CANCELADA", fleet_panel_included: true }));
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: false, reason: "not_entitled" });
  });
});
