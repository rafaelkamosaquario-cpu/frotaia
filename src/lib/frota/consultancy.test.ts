import { describe, it, expect } from "vitest";
import { consultancyCommand, isConsultant, passwordSchema, sameOrigin } from "./consultancy";
describe("separate consulting path", () => {
  it("requires the exact confirmed administrator email", () => {
    expect(isConsultant(null)).toBe(false);
    expect(isConsultant({ email: "rafaelkamosaquario@gmail.com" })).toBe(false);
    expect(isConsultant({ email: "other@gmail.com", email_confirmed_at: "now" })).toBe(false);
    expect(isConsultant({ email: "rafaelkamosaquario@gmail.com", email_confirmed_at: "now" })).toBe(true);
  });
  it("rejects short PINs and privilege injection", () => {
    expect(passwordSchema.safeParse("1234").success).toBe(false);
    expect(passwordSchema.safeParse("Onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("Temporary-12345").success).toBe(true);
    expect(consultancyCommand.safeParse({ action: "deliver", companyId: "10000000-0000-4000-8000-000000000001", password: "Temporary-12345", role: "owner" }).success).toBe(false);
  });
  it("requires an explicit same-origin POST", () => {
    const url = "https://frota.test/api/consultoria";
    expect(sameOrigin(new Request(url))).toBe(false);
    expect(sameOrigin(new Request(url, { headers: { origin: "https://evil.test" } }))).toBe(false);
    expect(sameOrigin(new Request(url, { headers: { origin: "https://frota.test" } }))).toBe(true);
  });
});
