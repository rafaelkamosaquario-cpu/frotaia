import { describe, expect, it } from "vitest";
import { ALL_MODULE_IDS, COMPANY_MODULES, moduleCommand, modulePathAllowed, moduleToolAllowed, routeModule, toggleCompanyModule } from "./companyModules";
import { FROTA_NAV_ITEMS } from "@/components/frota/frotaNavItems";
describe("company module policy", () => {
  it("preserves unconfigured companies", () => { expect(modulePathAllowed(null, "/api/frota/radares/123")).toBe(true); });
  it("blocks disabled page and nested API paths", () => {
    for (const path of ["/frota/oportunidades", "/api/frota/oportunidades/id", "/api/frota/radares/id", "/api/frota/fontes-radar"]) {
      expect(routeModule(path)).toBe("radar"); expect(modulePathAllowed([], path)).toBe(false); expect(modulePathAllowed(["radar"], path)).toBe(true);
    }
  });
  it("maps all menu destinations except the always available basics", () => {
    for (const item of FROTA_NAV_ITEMS.filter(i => !["/frota/dashboard", "/frota/empresa", "/frota/configuracoes"].includes(i.href))) expect(routeModule(item.href), item.href).not.toBeNull();
  });
  it("keeps basic navigation available with no optional module", () => { expect(modulePathAllowed([], "/frota/dashboard")).toBe(true); expect(modulePathAllowed([], "/frota/empresa")).toBe(true); });
  it("keeps route ownership unambiguous", () => { const paths = COMPANY_MODULES.flatMap(m => [...m.routes]); expect(new Set(paths).size).toBe(paths.length); });
  it("rejects tampered module saves", () => {
    const base = { companyId: "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac", revision: 0, enabled: [] };
    expect(moduleCommand.safeParse(base).success).toBe(true);
    for (const patch of [{ enabled: ["unknown"] }, { enabled: ["frota", "frota"] }, { revision: -1 }, { companyId: "bad" }, { enabled: ["financeiro"] }, { admin: true }]) expect(moduleCommand.safeParse({ ...base, ...patch }).success).toBe(false);
    expect(moduleCommand.safeParse({ ...base, enabled: ALL_MODULE_IDS }).success).toBe(true);
  });
  it("enforces financial dependencies without changing other modules", () => {
    expect(toggleCompanyModule(["agenda"], "financeiro", true)).toEqual(["agenda", "financeiro", "frota"]);
    expect(toggleCompanyModule(["agenda", "financeiro", "frota"], "frota", false)).toEqual(["agenda"]);
  });
  it("restricts assistant tools and broad history without disabling V1 by default", () => {
    expect(moduleToolAllowed([], "gerenciar_radar_frete")).toBe(false);
    expect(moduleToolAllowed(["radar"], "gerenciar_radar_frete")).toBe(true);
    expect(moduleToolAllowed([], "consultar_historico")).toBe(false);
    expect(moduleToolAllowed(null, "consultar_historico")).toBe(true);
    expect(moduleToolAllowed([], "unknown")).toBe(false);
  });
});
