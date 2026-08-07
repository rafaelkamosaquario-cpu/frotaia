import { describe, it, expect } from "vitest";
import { firstOnboardingMessage, processOnboardingMessage, type OnboardingCollectedData } from "./onboardingConversation";

/**
 * Cobre a etapa nova "o que você quer resolver primeiro" (awaiting_intent,
 * 07/08/2026) — não é uma suíte completa de todo o onboarding, só a parte
 * adicionada nesta rodada + os pontos de integração que ela toca
 * (awaiting_profile agora leva pra awaiting_intent, e a retomada de
 * "paused" precisa passar por lá também).
 */

describe("firstOnboardingMessage", () => {
  it("explica o valor do produto antes de pedir o nome", () => {
    const texto = firstOnboardingMessage();
    expect(texto).toContain("Como posso chamar você?");
    expect(texto.toLowerCase()).toContain("frete");
    expect(texto.toLowerCase()).toContain("combustível");
  });
});

describe("awaiting_profile → awaiting_intent", () => {
  it("depois de escolher o perfil, a próxima pergunta é a de intenção, não a de cidade", () => {
    const resultado = processOnboardingMessage("awaiting_profile", { name: "Rafael" }, "motorista_autonomo");
    expect(resultado.nextState).toBe("awaiting_intent");
    expect(resultado.reply.kind).toBe("list");
  });
});

describe("awaiting_intent", () => {
  const collectedBase: OnboardingCollectedData = { name: "Rafael", companyType: "autonomo", profileLabel: "motorista autônomo" };

  it("toque numa categoria salva intentId/intentLabel e segue pra cidade, com texto de transição", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "fretes");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("fretes");
    expect(resultado.collectedData.intentLabel).toBe("Fretes e viagens");
    expect(resultado.reply.kind).toBe("text");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("CT-e");
      expect(resultado.reply.text).toContain("cidade"); // pergunta de base location concatenada na mesma mensagem
    }
  });

  it("'ver tudo' manda o catálogo completo (todas as categorias) e ainda segue o fluxo normalmente", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "ver_tudo");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("ver_tudo");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("Notícias do setor");
      expect(resultado.reply.text).toContain("Fretes e viagens");
    }
  });

  it("aceita o título digitado por extenso, não só o id da lista", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "Pneus e manutenção");
    expect(resultado.collectedData.intentId).toBe("pneus_manutencao");
  });

  it("texto não reconhecido repete a mesma pergunta, sem avançar de estado", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "blablabla sem sentido");
    expect(resultado.nextState).toBe("awaiting_intent");
    expect(resultado.collectedData.intentId).toBeUndefined();
  });
});

describe("retomada de 'paused' — inclui a etapa de intenção na ordem certa", () => {
  it("sem intentId ainda, retoma pra awaiting_intent (não pula direto pra cidade)", () => {
    const resultado = processOnboardingMessage("paused", { name: "Rafael", companyType: "autonomo" }, "oi de novo");
    expect(resultado.nextState).toBe("awaiting_intent");
  });

  it("com intentId já preenchido, retoma pra awaiting_base_location", () => {
    const resultado = processOnboardingMessage(
      "paused",
      { name: "Rafael", companyType: "autonomo", intentId: "fretes", intentLabel: "Fretes e viagens" },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_base_location");
  });
});
