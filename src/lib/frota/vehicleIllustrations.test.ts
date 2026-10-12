import { describe,it,expect } from "vitest";
import { fleetIllustration } from "./fleetPresentation";
import { vehicleUpdateSchema } from "@/lib/validation/schemas";
describe("ilustrações configuráveis",()=>{
 it("funciona em qualquer empresa sem cruzar dados",()=>{
  expect(fleetIllustration("nova",{company_id:"nova",plate:"ABC1234",illustration_key:"julieta4"})?.image).toContain("truck-julieta-4");
  expect(fleetIllustration("outra",{company_id:"nova",plate:"ABC1234",illustration_key:"julieta4"})).toBeNull();
 });
 it("ícone genérico substitui escolha antiga explicitamente",()=>expect(fleetIllustration("0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac",{company_id:"0fba8f5d-ee49-4b94-bbe5-5b34a33e88ac",plate:"ONM1C53",illustration_key:"generic"})).toBeNull());
 it("aceita catálogo e rejeita caminhos arbitrários",()=>{
  expect(vehicleUpdateSchema.safeParse({illustrationKey:"loader"}).success).toBe(true);
  expect(vehicleUpdateSchema.safeParse({illustrationKey:"https://example.com/file"}).success).toBe(false);
 });
});
