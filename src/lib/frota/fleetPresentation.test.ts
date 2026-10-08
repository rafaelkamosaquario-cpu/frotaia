import { describe, expect, it } from "vitest";
import { fleetIllustration, followingMonth, partialBalance } from "./fleetPresentation";
const company = "0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac";
describe("approved fleet presentation", () => {
  it("uses the approved axle configurations only for the customer", () => {
    expect(fleetIllustration(company, { company_id: company, plate: "ONM-1C53" })?.caption).toContain("4 eixos");
    expect(fleetIllustration(company, { company_id: company, plate: "MMA7F30" })?.caption).toContain("3 eixos");
    expect(fleetIllustration("another", { company_id: "another", plate: "ONM1C53" })).toBeNull();
    expect(fleetIllustration(company, { company_id: "another", plate: "ONM1C53" })).toBeNull();
    expect(fleetIllustration(company, { company_id: company, plate: null })).toBeNull();
  });
  it("distinguishes the front loader from the winch", () => {
    expect(fleetIllustration(company, { company_id: company, plate: "VA980" })?.image).toContain("front-yellow");
    expect(fleetIllustration(company, { company_id: company, plate: "FO6610" })?.image).toContain("winch");
  });
  it("handles the next reporting period including year rollover", () => {
    expect(followingMonth("2026-09")).toBe("2026-10");
    expect(followingMonth("2026-12")).toBe("2027-01");
  });
  it("keeps payroll and fuel in partial balance without rounding drift", () => {
    expect(partialBalance(73866.8, 65146.45)).toBe(8720.35);
    expect(partialBalance(10.01, 20.02)).toBe(-10.01);
  });
});
