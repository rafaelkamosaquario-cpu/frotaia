import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CompanyRow, SubscriptionRow } from "@/lib/supabase/tables";

/**
 * Onboarding 2 (Frota IA Gestão/Painel, 08/2026) — getVehicleLimitForCompany
 * é a fonte central única do limite de veículos ativos (1 sem Painel de
 * Gestão, 10 com). Mesmo padrão de mock de fleetPanelAccess.test.ts, já
 * que a regra deve produzir exatamente o mesmo resultado de entitlement
 * que o gate do painel.
 */

const getCompany = vi.fn();
const getSubscription = vi.fn();

vi.mock("@/services/supabase/companyService", () => ({
  getCompany: (...args: unknown[]) => getCompany(...args),
}));

vi.mock("@/services/supabase/subscriptionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/supabase/subscriptionService")>();
  return { ...actual, getSubscription: (...args: unknown[]) => getSubscription(...args) };
});

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

describe("getVehicleLimitForCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCompany.mockResolvedValue(fakeCompany());
    getSubscription.mockResolvedValue(null);
  });

  it("retorna 1 sem nenhuma fonte de entitlement", async () => {
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");
    const limite = await getVehicleLimitForCompany({} as never, "company-1");
    expect(limite).toBe(1);
  });

  it("retorna 10 quando companies.fleet_panel_enabled é true (fonte legada)", async () => {
    getCompany.mockResolvedValue(fakeCompany({ fleet_panel_enabled: true }));
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");
    const limite = await getVehicleLimitForCompany({} as never, "company-1");
    expect(limite).toBe(10);
  });

  it("retorna 10 quando subscriptions.fleet_panel_included é true e a assinatura está ativa (fonte nova)", async () => {
    getSubscription.mockResolvedValue(fakeSubscription({ status: "ATIVA", fleet_panel_included: true }));
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");
    const limite = await getVehicleLimitForCompany({} as never, "company-1");
    expect(limite).toBe(10);
  });

  it("mensal e anual (parcelado/pix) dão o mesmo limite — a regra nunca lê subscriptions.plan", async () => {
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");

    getSubscription.mockResolvedValue(fakeSubscription({ plan: "MENSAL", status: "ATIVA", fleet_panel_included: true }));
    expect(await getVehicleLimitForCompany({} as never, "company-1")).toBe(10);

    getSubscription.mockResolvedValue(fakeSubscription({ plan: "ANUAL_PARCELADO", status: "ATIVA", fleet_panel_included: true }));
    expect(await getVehicleLimitForCompany({} as never, "company-1")).toBe(10);

    getSubscription.mockResolvedValue(fakeSubscription({ plan: "ANUAL_PIX", status: "ATIVA", fleet_panel_included: true }));
    expect(await getVehicleLimitForCompany({} as never, "company-1")).toBe(10);
  });

  it("retorna 1 quando fleet_panel_included é true mas a assinatura está cancelada", async () => {
    getSubscription.mockResolvedValue(fakeSubscription({ status: "CANCELADA", fleet_panel_included: true }));
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");
    const limite = await getVehicleLimitForCompany({} as never, "company-1");
    expect(limite).toBe(1);
  });

  it("retorna 1 quando a empresa não existe (defensivo)", async () => {
    getCompany.mockResolvedValue(null);
    const { getVehicleLimitForCompany } = await import("./vehicleLimit");
    const limite = await getVehicleLimitForCompany({} as never, "company-inexistente");
    expect(limite).toBe(1);
  });
});
