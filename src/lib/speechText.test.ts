import { describe, expect, it } from "vitest";
import { prepararTextoParaVoz } from "./speechText";
import { construirTextoAjudaCompleto, CATEGORIAS_AJUDA } from "./helpMenu";
import { ajudaConversacionalV1 } from "../ai/whatsapp/conversationExperience";

describe("apresentação sem exemplos e leitura sem ícones", () => {
  it("mantém todas as áreas sem emojis, numeração ou exemplos", () => {
    const texto=construirTextoAjudaCompleto();
    for(const categoria of CATEGORIAS_AJUDA){
      expect(texto).toContain(categoria.titulo);
      expect(texto).toContain(categoria.descricao);
      expect(texto).not.toContain(categoria.emoji);
      for(const exemplo of categoria.exemplos) expect(texto).not.toContain(exemplo);
    }
    expect(texto).not.toMatch(/CPK|custo por km|rodar sozinho|^\d+\./m);
    expect(texto).toContain("pausas e períodos de descanso");
    expect(ajudaConversacionalV1()).toBe(texto);
  });
  it("não lê ícones e mantém números, placas e valores", () => {
    expect(prepararTextoParaVoz("🚛 💰 🔧 🗺️ **CPK**: R$ 2,50. Placa ABC1D23.")).toBe("custo por quilômetro rodado: R$ 2,50. Placa ABC1D23.");
    expect(prepararTextoParaVoz("🇧🇷 👍🏽 850 toneladas")).toBe("850 toneladas");
  });
});

