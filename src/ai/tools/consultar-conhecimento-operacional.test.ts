import { describe, it, expect } from "vitest";
import { ferramentaConsultarConhecimentoOperacional } from "./consultar-conhecimento-operacional";

describe("consultar_conhecimento_operacional", () => {
  it("carrega o conteudo do topico TIPOS_DE_VEICULO", async () => {
    const r = await ferramentaConsultarConhecimentoOperacional.executar({ topico: "TIPOS_DE_VEICULO" });
    expect(r.sucesso).toBe(true);
    expect(r.conteudo).toContain("Cavalo mecânico");
    expect(r.conteudo).toContain("Bitrem");
  });

  it("carrega os 5 topicos originais normalmente", async () => {
    for (const topico of [
      "NEGOCIACAO_E_ATENDIMENTO",
      "MANUTENCAO_PREVENTIVA",
      "PNEUS_E_DIRECAO_ECONOMICA",
      "GESTAO_E_INDICADORES",
      "JORNADA_E_BEM_ESTAR",
    ] as const) {
      const r = await ferramentaConsultarConhecimentoOperacional.executar({ topico });
      expect(r.sucesso).toBe(true);
      expect(r.conteudo).toBeTruthy();
    }
  });

  it("rejeita topico invalido sem lancar", async () => {
    // @ts-expect-error -- testa entrada invalida de proposito
    const r = await ferramentaConsultarConhecimentoOperacional.executar({ topico: "NAO_EXISTE" });
    expect(r.sucesso).toBe(false);
  });
});
