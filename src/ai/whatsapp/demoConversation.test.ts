import { describe, it, expect } from "vitest";
import { askDemoChoice, resolverEscolhaDemo, TRANSICAO_POR_TRACK, FERRAMENTAS_POR_TRACK, FERRAMENTA_ALVO_POR_TRACK } from "./demoConversation";

describe("askDemoChoice — menu pequeno pré-cadastro (inversão do funil, 09/2026)", () => {
  it("é uma lista com as 4 opções (3 tracks + conhecer funcionalidades)", () => {
    const reply = askDemoChoice();
    expect(reply.kind).toBe("list");
    if (reply.kind !== "list") throw new Error("esperava list");
    expect(reply.options.map((o) => o.id)).toEqual(["frete", "rota", "custo", "funcionalidades"]);
  });

  it("nunca pede nome/perfil/cidade — não é o onboarding completo", () => {
    const reply = askDemoChoice();
    if (reply.kind !== "list") throw new Error("esperava list");
    expect(reply.text.toLowerCase()).not.toContain("como posso chamar você");
  });
});

describe("resolverEscolhaDemo", () => {
  it("aceita o id da lista (toque)", () => {
    expect(resolverEscolhaDemo("frete")).toBe("frete");
    expect(resolverEscolhaDemo("rota")).toBe("rota");
    expect(resolverEscolhaDemo("custo")).toBe("custo");
    expect(resolverEscolhaDemo("funcionalidades")).toBe("funcionalidades");
  });

  it("aceita o título digitado em texto livre, sem o emoji", () => {
    expect(resolverEscolhaDemo("Analisar um frete")).toBe("frete");
    expect(resolverEscolhaDemo("calcular uma rota")).toBe("rota");
  });

  it("texto não reconhecido devolve null (menu se repete, nunca trava)", () => {
    expect(resolverEscolhaDemo("blablabla")).toBeNull();
  });
});

describe("TRANSICAO_POR_TRACK / FERRAMENTAS_POR_TRACK / FERRAMENTA_ALVO_POR_TRACK", () => {
  it("todo track tem transição, ferramentas permitidas e ferramenta-alvo definidas", () => {
    (["frete", "rota", "custo"] as const).forEach((track) => {
      expect(TRANSICAO_POR_TRACK[track]).toBeTruthy();
      expect(FERRAMENTAS_POR_TRACK[track].length).toBeGreaterThan(0);
      expect(FERRAMENTAS_POR_TRACK[track]).toContain(FERRAMENTA_ALVO_POR_TRACK[track]);
    });
  });

  it("nenhum track libera as 39 ferramentas completas — cada um tem um recorte pequeno", () => {
    (["frete", "rota", "custo"] as const).forEach((track) => {
      expect(FERRAMENTAS_POR_TRACK[track].length).toBeLessThanOrEqual(4);
    });
  });
});
