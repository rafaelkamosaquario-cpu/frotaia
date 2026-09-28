import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { construirSystemPrompt } from "./systemPrompt";
import type { CustomerContext, VehicleContext } from "@/ai/context/customerContext";
const customer: CustomerContext = { profile: null, company: null, role: null, preferences: null, memories: [], activeRadars: [] };
const vehicle: VehicleContext = { vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null };
describe("estilo conversacional isolado para WhatsApp V1", () => {
  it("usa apresentação curta no WhatsApp sem ordem contraditória de copiar catálogo", () => {
    const prompt = construirSystemPrompt(customer, vehicle, new Date("2026-09-28T12:00:00Z"), false, true);
    expect(prompt).toContain("EXPERIÊNCIA WHATSAPP V1");
    expect(prompt).not.toContain("COLE O TEXTO");
    expect(prompt).toContain("combustível, manutenção, pneus e fretes");
  });
  it("preserva comportamento do painel quando a flag não é enviada", () => {
    const prompt = construirSystemPrompt(customer, vehicle, new Date("2026-09-28T12:00:00Z"));
    expect(prompt).not.toContain("EXPERIÊNCIA WHATSAPP V1");
    expect(prompt).toContain("COLE O TEXTO");
  });
});
