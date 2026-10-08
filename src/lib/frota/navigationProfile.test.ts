import { describe, it, expect } from "vitest";
import { isTimberNavigation, TIMBER_PRIMARY, TIMBER_SUPPORT } from "./navigationProfile";
import { FROTA_NAV_ITEMS } from "@/components/frota/frotaNavItems";

describe("customer navigation preset", () => {
  it("is isolated to the approved company", () => {
    expect(isTimberNavigation("0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac")).toBe(true);
    expect(isTimberNavigation("another-company")).toBe(false);
    expect(isTimberNavigation("")).toBe(false);
  });
  it("keeps six main destinations without radar", () => {
    expect(TIMBER_PRIMARY).toHaveLength(6);
    expect(TIMBER_PRIMARY.some(item => item.href.includes("oportunidades"))).toBe(false);
    expect(TIMBER_PRIMARY.some(item => item.href === "/frota/resultados")).toBe(true);
  });
  it("retains the operating registers through real existing destinations", () => {
    for (const href of TIMBER_SUPPORT) expect(FROTA_NAV_ITEMS.some(item => item.href === href)).toBe(true);
    expect(TIMBER_SUPPORT).toContain("/frota/custos");
    expect(TIMBER_SUPPORT).toContain("/frota/abastecimentos");
    expect(TIMBER_SUPPORT).not.toContain("/frota/oportunidades");
  });
});
