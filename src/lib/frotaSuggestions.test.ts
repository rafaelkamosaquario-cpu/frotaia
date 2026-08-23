import { describe, it, expect } from "vitest";
import { FROTA_SUGGESTIONS, SUGESTOES_LISTA_NATIVA_WHATSAPP, resolverSelecaoNumerada } from "./frotaSuggestions";

/**
 * Cobre o redesenho do menu pós-onboarding V1 (08/2026, "1 usuário + 1
 * veículo") — 10 sugestões, dentro do limite nativo de lista do WhatsApp.
 */

describe("FROTA_SUGGESTIONS — novo menu de 10 itens", () => {
  it("tem exatamente 10 itens, já dentro do limite nativo do WhatsApp", () => {
    expect(FROTA_SUGGESTIONS).toHaveLength(10);
    expect(SUGESTOES_LISTA_NATIVA_WHATSAPP).toHaveLength(10);
  });

  it("inclui as novidades do menu (Radar, despesa, manutenção, documentos, rota, ver tudo)", () => {
    const ids = FROTA_SUGGESTIONS.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "analisar_frete",
        "procurar_oportunidades",
        "calcular_custos_viagem",
        "registrar_despesa",
        "organizar_manutencao",
        "documentos_vencimentos",
        "consultar_rota",
        "criar_lembrete",
        "comparar_pneus",
        "ver_tudo",
      ])
    );
  });

  it('a sugestão "ver tudo" usa a mesma frase-gatilho determinística de helpMenu.ts', () => {
    const verTudo = FROTA_SUGGESTIONS.find((s) => s.id === "ver_tudo");
    expect(verTudo?.whatsappDescription.toLowerCase()).toContain("o que você faz");
  });

  it("resolverSelecaoNumerada aceita 1 a 10 (fallback em texto)", () => {
    expect(resolverSelecaoNumerada("1")?.id).toBe("analisar_frete");
    expect(resolverSelecaoNumerada("10")?.id).toBe("ver_tudo");
    expect(resolverSelecaoNumerada("11")).toBeUndefined();
  });
});
