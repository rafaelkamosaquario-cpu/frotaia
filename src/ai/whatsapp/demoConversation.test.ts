import { describe, it, expect } from "vitest";
import { askDemoChoice, resolverEscolhaDemo, TRANSICAO_POR_TRACK, FERRAMENTAS_POR_TRACK, FERRAMENTA_ALVO_POR_TRACK, demoEntregouValor, ehAtalhoDemo } from "./demoConversation";

describe("askDemoChoice — menu pequeno pré-cadastro (inversão do funil, 09/2026)", () => {
  it("oferece quatro necessidades e explicação, preservando o teste antes de pagar", () => {
    const reply = askDemoChoice();
    expect(reply.kind).toBe("list");
    if (reply.kind !== "list") throw new Error("esperava list");
    expect(reply.options.map((o) => o.id)).toEqual(["combustivel", "manutencao", "pneus", "frete", "funcionalidades"]);
    expect(reply.text).toContain("antes de escolher um plano");
  });

  it("nunca pede nome/perfil/cidade — não é o onboarding completo", () => {
    const reply = askDemoChoice();
    if (reply.kind !== "list") throw new Error("esperava list");
    expect(reply.text.toLowerCase()).not.toContain("como posso chamar você");
  });
});

describe("conversa natural e acesso restrito", () => {
  it.each([["Meu caminhão está bebendo demais", "combustivel"], ["Preciso trocar óleo", "manutencao"], ["Vale recapar este pneu?", "pneus"], ["Quero uma carga de retorno", "frete"]])("entende %s", (texto, esperado) => expect(resolverEscolhaDemo(texto)).toBe(esperado));
  it("não confunde pedido completo com toque e rejeita chaves de protótipo", () => {
    expect(ehAtalhoDemo("Combustível")).toBe(true);
    expect(ehAtalhoDemo("Gastei 800 de diesel")).toBe(false);
    expect(resolverEscolhaDemo("constructor")).toBeNull();
  });
  it("nenhuma área de teste libera gravação operacional", () => {
    for (const lista of Object.values(FERRAMENTAS_POR_TRACK)) {
      expect(lista.length).toBeLessThan(39);
      expect(lista.every(n => !/^(registrar_|gerenciar_)/.test(n))).toBe(true);
    }
  });
  it("CTA só após sucesso de ferramenta disponível", () => {
    expect(demoEntregouValor("combustivel", ["calcular_combustivel"])).toBe(true);
    expect(demoEntregouValor("combustivel", [])).toBe(false);
    expect(demoEntregouValor("combustivel", ["registrar_despesa"])).toBe(false);
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
