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

it("injeta identidade pessoal e campos estruturados do veículo",()=>{
 const c={...customer,profile:{full_name:"Rafael"}} as CustomerContext;
 const v={...vehicle,vehicle:{name:"Scania P310",brand:"Scania",model:"P310",plate:"ABC0125",vehicle_type:"truck"}} as VehicleContext;
 const p=construirSystemPrompt(c,v,new Date(),false,true);
 expect(p).toContain("Nome da pessoa/motorista: Rafael");expect(p).toContain("marca do caminhão: Scania");expect(p).toContain("modelo do caminhão: P310");expect(p).toContain("Não liste campos vazios");expect(p).toContain("Quer analisar um frete ou calcular uma rota?");
});

