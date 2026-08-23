import { describe, it, expect } from "vitest";
import { ehPedidoDeAjuda, ehPedidoDeFuncionalidades, construirTextoAjudaCompleto, CATEGORIAS_AJUDA } from "./helpMenu";

/**
 * Regressão do achado real em 07/08/2026: "quais suas funções" caía na IA
 * (que resumiu e derrubou a categoria "Notícias do setor" da resposta) em
 * vez de bater no gatilho determinístico. ehPedidoDeAjuda e
 * ehPedidoDeFuncionalidades precisam ser mutuamente exclusivos — cada
 * frase deve cair em exatamente um dos dois, nunca nos dois nem em nenhum
 * quando é claramente uma delas.
 */

describe("ehPedidoDeFuncionalidades", () => {
  it("reconhece variações de 'o que você faz'/'funções'", () => {
    expect(ehPedidoDeFuncionalidades("quais suas funções")).toBe(true);
    expect(ehPedidoDeFuncionalidades("o que você faz")).toBe(true);
    expect(ehPedidoDeFuncionalidades("o que voce pode fazer")).toBe(true);
    expect(ehPedidoDeFuncionalidades("mostrar funcoes")).toBe(true);
    expect(ehPedidoDeFuncionalidades("quais são as funções do frota ia")).toBe(true);
  });

  it("não reconhece uma mensagem de cálculo comum", () => {
    expect(ehPedidoDeFuncionalidades("meu caminhão faz 2,5 km/l")).toBe(false);
  });

  it("ignora texto vazio/nulo", () => {
    expect(ehPedidoDeFuncionalidades("")).toBe(false);
    expect(ehPedidoDeFuncionalidades(null)).toBe(false);
    expect(ehPedidoDeFuncionalidades(undefined)).toBe(false);
  });
});

describe("ehPedidoDeAjuda vs ehPedidoDeFuncionalidades — mutuamente exclusivos", () => {
  it("'ajuda'/'menu'/'sugestões' só batem em ehPedidoDeAjuda", () => {
    for (const frase of ["ajuda", "menu", "sugestões", "opções"]) {
      expect(ehPedidoDeAjuda(frase)).toBe(true);
      expect(ehPedidoDeFuncionalidades(frase)).toBe(false);
    }
  });

  it("'quais suas funções'/'o que você faz' só batem em ehPedidoDeFuncionalidades", () => {
    for (const frase of ["quais suas funções", "o que você faz", "mostrar funções"]) {
      expect(ehPedidoDeFuncionalidades(frase)).toBe(true);
      expect(ehPedidoDeAjuda(frase)).toBe(false);
    }
  });
});

describe("construirTextoAjudaCompleto", () => {
  it("inclui todas as categorias, sem pular nenhuma (inclusive Notícias do setor)", () => {
    const texto = construirTextoAjudaCompleto();
    for (const categoria of CATEGORIAS_AJUDA) {
      expect(texto).toContain(categoria.titulo);
    }
    expect(texto).toContain("Notícias do transporte");
  });
});
