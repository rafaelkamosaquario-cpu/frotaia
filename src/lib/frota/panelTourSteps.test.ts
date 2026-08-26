import { describe, it, expect } from "vitest";
import { PANEL_TOUR_STEPS, PANEL_TOUR_STEP_DEFS, proximoPassoTourV2, passoAnteriorTourV2, progressoTourV2 } from "./panelTourSteps";

/**
 * Tour visual do Painel V2 (08/2026) — cobertura da configuração pura dos
 * passos (33. seções 27/29 da spec). O comportamento de renderização/
 * interação real (spotlight, cartão, teclado, mobile) não tem teste
 * automatizado — este projeto não usa React Testing Library/jsdom em
 * nenhum componente (vitest roda em `environment: "node"`, só `*.test.ts`)
 * e eu optei por não introduzir essa infraestrutura só pra este recurso.
 * Verificado de verdade no navegador (desktop + mobile) — ver relatório
 * final.
 */

describe("PANEL_TOUR_STEPS / PANEL_TOUR_STEP_DEFS", () => {
  it("são 8 passos, na ordem descrita na spec", () => {
    expect(PANEL_TOUR_STEPS).toEqual(["dashboard", "indicadores", "ia_sugere", "frota", "operacao", "radar", "ia_widget", "conclusao"]);
  });

  it("todo passo tem uma definição com número 1-based coerente com a posição", () => {
    PANEL_TOUR_STEPS.forEach((step, indice) => {
      expect(PANEL_TOUR_STEP_DEFS[step].numero).toBe(indice + 1);
    });
  });

  it("só o último passo (conclusão) não tem elemento-alvo", () => {
    PANEL_TOUR_STEPS.slice(0, -1).forEach((step) => {
      expect(PANEL_TOUR_STEP_DEFS[step].target.kind).not.toBe("none");
    });
    expect(PANEL_TOUR_STEP_DEFS.conclusao.target.kind).toBe("none");
  });

  it("passos que apontam pra nav usam hrefs reais do painel (nunca inventados)", () => {
    const hrefsReais = ["/frota/dashboard", "/frota/veiculos", "/frota/manutencao", "/frota/oportunidades"];
    PANEL_TOUR_STEPS.forEach((step) => {
      const target = PANEL_TOUR_STEP_DEFS[step].target;
      if (target.kind === "nav-href") expect(hrefsReais).toContain(target.href);
    });
  });
});

describe("proximoPassoTourV2 / passoAnteriorTourV2", () => {
  it("avança na ordem definida", () => {
    expect(proximoPassoTourV2("dashboard")).toBe("indicadores");
    expect(proximoPassoTourV2("radar")).toBe("ia_widget");
  });

  it("null depois do último passo", () => {
    expect(proximoPassoTourV2("conclusao")).toBeNull();
  });

  it("volta na ordem definida", () => {
    expect(passoAnteriorTourV2("indicadores")).toBe("dashboard");
  });

  it("null antes do primeiro passo (sem botão Voltar no passo 1)", () => {
    expect(passoAnteriorTourV2("dashboard")).toBeNull();
  });
});

describe("progressoTourV2", () => {
  it("formata 'N de 8' pro passo atual", () => {
    expect(progressoTourV2("dashboard")).toBe("1 de 8");
    expect(progressoTourV2("conclusao")).toBe("8 de 8");
  });
});
