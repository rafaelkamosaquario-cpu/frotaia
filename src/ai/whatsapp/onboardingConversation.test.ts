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
    expect(texto.toLowerCase()).toContain("frete");
    expect(texto.toLowerCase()).toContain("radar de fretes");
  });

  it("a pergunta do nome cobre pessoa E empresa/operação (fechamento 08/2026) — mesma resposta vira profiles.full_name e companies.name, e a pergunta acontece antes de saber se é motorista autônomo ou dono de empresa", () => {
    const texto = firstOnboardingMessage();
    expect(texto).toContain("Como posso chamar você (ou sua empresa/operação)?");
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

  it("toque numa categoria salva intentId/intentLabel e segue pra cidade, com texto de transição (menciona o Radar de Fretes)", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "fretes");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("fretes");
    expect(resultado.collectedData.intentLabel).toBe("Fretes e oportunidades");
    expect(resultado.reply.kind).toBe("text");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("Radar de Fretes");
      expect(resultado.reply.text).toContain("cidade"); // pergunta de base location concatenada na mesma mensagem
    }
  });

  it("'ver tudo' apresenta as necessidades sem catálogo longo e segue o cadastro", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "ver_tudo");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("ver_tudo");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("combustível");
      expect(resultado.reply.text).toContain("Fretes");
    }
  });

  it("aceita o título digitado por extenso, não só o id da lista", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "Manutenção e pneus");
    expect(resultado.collectedData.intentId).toBe("pneus_manutencao");
  });

  it("texto não reconhecido repete a mesma pergunta, sem avançar de estado", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "blablabla sem sentido");
    expect(resultado.nextState).toBe("awaiting_intent");
    expect(resultado.collectedData.intentId).toBeUndefined();
  });
});
