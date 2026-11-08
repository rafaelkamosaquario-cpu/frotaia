import { describe,it,expect } from "vitest";
import { DIRECT_PLANS,directPaymentCommand,directSalesUrl,normalizeDirectPhone,directPhoneVariants } from "./directSales";
import { CATALOGO_OFERTAS } from "./catalog";
const command={requestId:"10000000-0000-4000-8000-000000000001",companyId:"10000000-0000-4000-8000-000000000002",phone:"(41) 99729-5836",plan:"INDIVIDUAL_MENSAL",reference:"123456789",amountCents:8990,paidAt:"2026-01-01T10:00:00-03:00",confirmed:true};
describe("contratação direta",()=>{
 it("encontra celular com ou sem o nono dígito, preservando fixos",()=>{
  expect(directPhoneVariants("42 99858-2489")).toEqual(["+5542998582489","+554298582489"]);
  expect(directPhoneVariants("+55 42 9858-2489")).toEqual(["+554298582489","+5542998582489"]);
  expect(directPhoneVariants("42 3252-1234")).toEqual(["+554232521234"]);
  expect(directPhoneVariants("123")).toEqual([]);
 });
 it("aceita e normaliza EndToEnd Pix sem aceitar chave ou copia e cola",()=>{
  const reference="E00416968202609252122LOCeusGMiK1";
  expect(directPaymentCommand.parse({...command,reference:reference.toLowerCase()}).reference).toBe(reference.toUpperCase());
  for(const reference of ["+5541997295836","chave@teste.com", "E123", "00020126360014br.gov.bcb.pix"])
   expect(directPaymentCommand.safeParse({...command,reference}).success).toBe(false);
 });
 it.each(DIRECT_PLANS)("gera destino e preço corretos %s",plan=>{const url=new URL(directSalesUrl(plan));expect(url.pathname).toBe("/5541997295836");expect(url.searchParams.get("text")).toContain(CATALOGO_OFERTAS[plan].label);});
 it("normaliza telefone sem transformar email em identidade",()=>{expect(normalizeDirectPhone(command.phone)).toBe("+5541997295836");expect(normalizeDirectPhone("abc")).toBeNull();});
 it("aceita confirmação completa",()=>expect(directPaymentCommand.parse(command).phone).toBe("+5541997295836"));
 it.each([{confirmed:false},{amountCents:1},{reference:"print"},{plan:"TRIAL"},{paidAt:"2999-01-01T00:00:00Z"},{phone:"123"},{companyId:"outro"},{role:"admin"}])("rejeita entrada inválida %j",patch=>expect(directPaymentCommand.safeParse({...command,...patch}).success).toBe(false));
});
