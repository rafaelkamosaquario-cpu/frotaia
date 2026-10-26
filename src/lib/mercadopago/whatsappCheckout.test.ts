import { describe, it, expect } from "vitest";
import { mensagemOpcoesContratacao } from "./whatsappCheckout";
describe("opções de contratação no WhatsApp",()=>{
 it("oferece checkout e Pix assistido mensal sem liberar acesso",()=>{
  const text=mensagemOpcoesContratacao("INDIVIDUAL_MENSAL","https://example.test/assinar?token=teste");
  expect(text).toContain("1. Checkout pelo Mercado Pago");
  expect(text).toContain("https://example.test/assinar?token=teste");
  expect(text).toContain("2. Pix com atendimento do Rafael");
  expect(text).toContain("https://wa.me/5541997295836");
  expect(decodeURIComponent(text)).toContain("89,90");
  expect(text).toContain("libera o plano manualmente");
 });
 it.each(["INDIVIDUAL_ANUAL_PIX","INDIVIDUAL_ANUAL_PARCELADO"] as const)("usa valor anual Pix para atendimento de %s",plano=>{
  const text=mensagemOpcoesContratacao(plano,"https://example.test/assinar");
  const manual=decodeURIComponent(text.split("2. Pix com atendimento do Rafael")[1]);
  expect(manual).toContain("899,00");expect(manual).toContain("anual");
 });
 it.each(["ESSENCIAL_MENSAL","PRO_MENSAL"] as const)("preserva implantação assistida de %s",plano=>{
  const text=mensagemOpcoesContratacao(plano,"https://example.test/implantacao");
  expect(text).toContain("Rafael prepara sua empresa");expect(text).not.toContain("1. Checkout");
 });
});
