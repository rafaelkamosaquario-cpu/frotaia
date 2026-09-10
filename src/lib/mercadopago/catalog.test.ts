import { describe, it, expect } from "vitest";
import { CATALOGO_OFERTAS, PLANOS_AUTOATENDIMENTO, isOfertaPlano, formatarReais } from "./catalog";

/**
 * Estrutura comercial (09/2026, "Individual/Essencial/Pro") — o catálogo
 * é a fonte única de preço/billing/entitlement; estes testes travam os
 * valores acordados pra qualquer mudança futura precisar passar por aqui,
 * não por um número solto em algum outro arquivo.
 */

describe("CATALOGO_OFERTAS", () => {
  it("Individual Mensal: R$89,90/mês, sem painel, 1 veículo", () => {
    expect(CATALOGO_OFERTAS.INDIVIDUAL_MENSAL).toMatchObject({
      precoCentavos: 8990,
      cobranca: "recorrente",
      painel: false,
      limiteVeiculos: 1,
    });
  });

  it("Individual Anual: R$899,00 à vista (Pix) ou 12x R$74,92 (cartão), sem painel, 12 meses", () => {
    expect(CATALOGO_OFERTAS.INDIVIDUAL_ANUAL_PIX).toMatchObject({
      precoCentavos: 89900,
      cobranca: "unica",
      metodoUnico: "pix",
      validadeMeses: 12,
      painel: false,
      limiteVeiculos: 1,
    });
    expect(CATALOGO_OFERTAS.INDIVIDUAL_ANUAL_PARCELADO).toMatchObject({
      precoCentavos: 89900,
      cobranca: "unica",
      metodoUnico: "cartao",
      validadeMeses: 12,
      painel: false,
      limiteVeiculos: 1,
      parcelas: 12,
    });
  });

  it("Essencial Mensal: R$149,90/mês, com painel, até 3 veículos", () => {
    expect(CATALOGO_OFERTAS.ESSENCIAL_MENSAL).toMatchObject({
      precoCentavos: 14990,
      cobranca: "recorrente",
      painel: true,
      limiteVeiculos: 3,
    });
  });

  it("Essencial Anual: R$1.499,00 à vista (Pix) ou 12x R$124,92 (cartão), com painel, até 3 veículos, 12 meses", () => {
    expect(CATALOGO_OFERTAS.ESSENCIAL_ANUAL_PIX).toMatchObject({
      precoCentavos: 149900,
      cobranca: "unica",
      metodoUnico: "pix",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 3,
    });
    expect(CATALOGO_OFERTAS.ESSENCIAL_ANUAL_PARCELADO).toMatchObject({
      precoCentavos: 149900,
      cobranca: "unica",
      metodoUnico: "cartao",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 3,
      parcelas: 12,
    });
  });

  it("Pro Mensal: R$249,90/mês, com painel, até 10 veículos", () => {
    expect(CATALOGO_OFERTAS.PRO_MENSAL).toMatchObject({
      precoCentavos: 24990,
      cobranca: "recorrente",
      painel: true,
      limiteVeiculos: 10,
    });
  });

  it("Pro Anual: R$2.499,00 à vista (Pix) ou 12x R$208,25 (cartão), com painel, até 10 veículos, 12 meses", () => {
    expect(CATALOGO_OFERTAS.PRO_ANUAL_PIX).toMatchObject({
      precoCentavos: 249900,
      cobranca: "unica",
      metodoUnico: "pix",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 10,
    });
    expect(CATALOGO_OFERTAS.PRO_ANUAL_PARCELADO).toMatchObject({
      precoCentavos: 249900,
      cobranca: "unica",
      metodoUnico: "cartao",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 10,
      parcelas: 12,
    });
  });

  it("os valores das parcelas anuais batem com o combinado (divisão do total por 12)", () => {
    expect(CATALOGO_OFERTAS.INDIVIDUAL_ANUAL_PARCELADO.precoCentavos / 12).toBeCloseTo(7492, 0);
    expect(CATALOGO_OFERTAS.ESSENCIAL_ANUAL_PARCELADO.precoCentavos / 12).toBeCloseTo(12492, 0);
    expect(CATALOGO_OFERTAS.PRO_ANUAL_PARCELADO.precoCentavos / 12).toBe(20825);
  });

  it("preços antigos (R$79,90/R$99,90/R$838,80) não aparecem mais no catálogo", () => {
    const precos = Object.values(CATALOGO_OFERTAS).map((o) => o.precoCentavos);
    expect(precos).not.toContain(7990);
    expect(precos).not.toContain(9990);
    expect(precos).not.toContain(83880);
  });
});

describe("isOfertaPlano", () => {
  it("aceita as 9 chaves do catálogo", () => {
    expect(PLANOS_AUTOATENDIMENTO).toHaveLength(9);
    for (const plano of PLANOS_AUTOATENDIMENTO) {
      expect(isOfertaPlano(plano)).toBe(true);
    }
  });

  it("rejeita TRIAL, EMPRESA, chaves antigas e strings inválidas", () => {
    expect(isOfertaPlano("TRIAL")).toBe(false);
    expect(isOfertaPlano("EMPRESA")).toBe(false);
    expect(isOfertaPlano("MENSAL")).toBe(false);
    expect(isOfertaPlano("GESTAO_MENSAL")).toBe(false);
    expect(isOfertaPlano("ANUAL_PARCELADO")).toBe(false);
    expect(isOfertaPlano("ANUAL_PIX")).toBe(false);
    expect(isOfertaPlano("QUALQUER_COISA")).toBe(false);
  });
});

describe("formatarReais", () => {
  it("formata centavos como Real brasileiro", () => {
    expect(formatarReais(8990)).toContain("89,90");
    expect(formatarReais(249900)).toContain("2.499,00");
  });
});
