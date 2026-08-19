import { describe, expect, it } from "vitest";
import { avaliarPossivelFrete } from "./cheapFilter";

describe("avaliarPossivelFrete", () => {
  it("descarta conversa social sem chamar categoria nenhuma", () => {
    const resultado = avaliarPossivelFrete("bom dia pessoal, tudo certo?");
    expect(resultado.parecePossivelFrete).toBe(false);
  });

  it("descarta pergunta não relacionada a frete", () => {
    const resultado = avaliarPossivelFrete("alguém conhece uma borracharia boa aqui perto?");
    expect(resultado.parecePossivelFrete).toBe(false);
  });

  it("reconhece oferta de frete completa (etapa 55 — mensagem bagunçada)", () => {
    const resultado = avaliarPossivelFrete("cj 7e vazio goiania carga ctba 30 ton 8500 carr amanha chamar pv");
    expect(resultado.parecePossivelFrete).toBe(true);
    expect(resultado.categoriasBatidas).toContain("peso");
  });

  it("reconhece oferta de frete clara com valor/carroceria/peso", () => {
    const resultado = avaliarPossivelFrete("Carga Goiânia x Curitiba, sider, 28t, R$8.500.");
    expect(resultado.parecePossivelFrete).toBe(true);
    expect(resultado.categoriasBatidas).toEqual(expect.arrayContaining(["valor", "peso", "carroceria"]));
  });

  it("reconhece oferta sem valor (etapa 56) só por peso/carroceria/transporte", () => {
    const resultado = avaliarPossivelFrete("Carga Goiânia x Curitiba, sider, 28t.");
    expect(resultado.parecePossivelFrete).toBe(true);
  });

  it("não exige perfeição — 1 categoria só não é suficiente", () => {
    const resultado = avaliarPossivelFrete("hoje tá frio");
    expect(resultado.pontuacao).toBe(0);
    expect(resultado.parecePossivelFrete).toBe(false);
  });
});
