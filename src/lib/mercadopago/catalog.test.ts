import { describe, it, expect } from "vitest";
import { CATALOGO_OFERTAS, PLANOS_AUTOATENDIMENTO, PRECO_UPSELL_GESTAO_CENTAVOS, isOfertaPlano, formatarReais } from "./catalog";

/**
 * Nova estrutura comercial (08/2026, "Individual vs. Gestão") — o catálogo
 * é a fonte única de preço/billing/entitlement; estes testes travam os
 * valores acordados pra qualquer mudança futura precisar passar por aqui,
 * não por um número solto em algum outro arquivo.
 */

describe("CATALOGO_OFERTAS", () => {
  it("Individual (MENSAL): R$79,90/mês, sem painel, 1 veículo", () => {
    expect(CATALOGO_OFERTAS.MENSAL).toMatchObject({
      precoCentavos: 7990,
      cobranca: "recorrente",
      painel: false,
      limiteVeiculos: 1,
    });
  });

  it("Gestão Mensal: R$99,90/mês, com painel, 10 veículos", () => {
    expect(CATALOGO_OFERTAS.GESTAO_MENSAL).toMatchObject({
      precoCentavos: 9990,
      cobranca: "recorrente",
      painel: true,
      limiteVeiculos: 10,
    });
  });

  it("Gestão Anual cartão: R$838,80 total, até 12x, com painel, 12 meses", () => {
    expect(CATALOGO_OFERTAS.ANUAL_PARCELADO).toMatchObject({
      precoCentavos: 83880,
      cobranca: "unica",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 10,
      parcelas: 12,
    });
  });

  it("Gestão Anual Pix: R$799,00 à vista, com painel, 12 meses", () => {
    expect(CATALOGO_OFERTAS.ANUAL_PIX).toMatchObject({
      precoCentavos: 79900,
      cobranca: "unica",
      validadeMeses: 12,
      painel: true,
      limiteVeiculos: 10,
    });
  });

  it("upsell do Individual pro Gestão Mensal é de R$20,00 (2000 centavos)", () => {
    expect(PRECO_UPSELL_GESTAO_CENTAVOS).toBe(2000);
  });

  it("preços antigos (R$59,90/12x, R$647) não aparecem mais no catálogo", () => {
    const precos = Object.values(CATALOGO_OFERTAS).map((o) => o.precoCentavos);
    expect(precos).not.toContain(71880);
    expect(precos).not.toContain(64700);
    expect(precos).not.toContain(5990);
  });
});

describe("isOfertaPlano", () => {
  it("aceita as 4 chaves do catálogo", () => {
    for (const plano of PLANOS_AUTOATENDIMENTO) {
      expect(isOfertaPlano(plano)).toBe(true);
    }
  });

  it("rejeita TRIAL, EMPRESA e strings inválidas", () => {
    expect(isOfertaPlano("TRIAL")).toBe(false);
    expect(isOfertaPlano("EMPRESA")).toBe(false);
    expect(isOfertaPlano("QUALQUER_COISA")).toBe(false);
  });
});

describe("formatarReais", () => {
  it("formata centavos como Real brasileiro", () => {
    expect(formatarReais(7990)).toContain("79,90");
    expect(formatarReais(83880)).toContain("838,80");
  });
});
