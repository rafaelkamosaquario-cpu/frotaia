import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompanyRow } from "@/lib/supabase/tables";

const loadCustomerContext = vi.fn();

vi.mock("@/ai/context/customerContext", () => ({
  loadCustomerContext: (...args: unknown[]) => loadCustomerContext(...args),
}));

function fakeClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never;
}

function fakeCompany(overrides: Partial<CompanyRow> = {}): CompanyRow {
  return { id: "company-1", name: "Transportes Teste", fleet_panel_enabled: false, ...overrides } as CompanyRow;
}

describe("loadFleetPanelAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("retorna not_entitled quando a empresa não tem fleet_panel_enabled", async () => {
    loadCustomerContext.mockResolvedValue({
      profile: null,
      company: fakeCompany({ fleet_panel_enabled: false }),
      role: "owner",
      preferences: null,
    });
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: false, reason: "not_entitled" });
  });

  it("retorna ok=true com empresa e role quando fleet_panel_enabled é true", async () => {
    const company = fakeCompany({ fleet_panel_enabled: true });
    loadCustomerContext.mockResolvedValue({ profile: null, company, role: "owner", preferences: null });
    const { loadFleetPanelAccess } = await import("./fleetPanelAccess");
    const resultado = await loadFleetPanelAccess(fakeClient({ id: "user-1" }));

    expect(resultado).toEqual({ ok: true, userId: "user-1", company, role: "owner" });
  });
});
