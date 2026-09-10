import { describe, it, expect } from "vitest";
import { resolverIntencaoComercialLanding, mensagemConfirmacaoOferta, MENSAGEM_INTERESSE_EMPRESAS } from "./landingIntent";

/**
 * Reconhecimento das mensagens dos CTAs da landing (09/2026, estrutura
 * Individual/Essencial/Pro). Cobertura central: o texto nunca determina o
 * preço, só a CHAVE do plano — mesmo que o valor mencionado na mensagem
 * seja adulterado, a função ignora completamente o número.
 */

describe("resolverIntencaoComercialLanding", () => {
  it("reconhece a mensagem oficial do CTA Individual (mensal, sem a palavra 'anual')", () => {
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual por R$89,90/mês.")).toBe("INDIVIDUAL_MENSAL");
  });

  it("reconhece a mensagem oficial do CTA Essencial (mensal)", () => {
    expect(resolverIntencaoComercialLanding("Quero contratar o Frota IA Essencial.")).toBe("ESSENCIAL_MENSAL");
  });

  it("reconhece a mensagem oficial do CTA Pro (mensal)", () => {
    expect(resolverIntencaoComercialLanding("Quero contratar o Frota IA Pro.")).toBe("PRO_MENSAL");
  });

  it("reconhece 'anual' pra qualquer plano, sem decidir cartão/Pix (isso é escolhido só no gate)", () => {
    expect(resolverIntencaoComercialLanding("Quero o Frota IA Individual anual")).toBe("INDIVIDUAL_ANUAL_PARCELADO");
    expect(resolverIntencaoComercialLanding("Quero o Frota IA Essencial anual")).toBe("ESSENCIAL_ANUAL_PARCELADO");
    expect(resolverIntencaoComercialLanding("Quero o Frota IA Pro anual")).toBe("PRO_ANUAL_PARCELADO");
  });

  it("reconhece a mensagem oficial do CTA Empresas", () => {
    expect(resolverIntencaoComercialLanding("Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos.")).toBe("EMPRESAS");
  });

  it("'pro' só é reconhecido como palavra isolada (evita falso positivo em outras palavras)", () => {
    expect(resolverIntencaoComercialLanding("Quero um profissional para me ajudar")).toBeNull();
  });

  it("mensagem genérica 'quero assinar' não é reconhecida como nenhuma oferta específica (segue pro fluxo normal, IA apresenta as opções)", () => {
    expect(resolverIntencaoComercialLanding("quero assinar")).toBeNull();
    expect(resolverIntencaoComercialLanding("quais planos vocês têm?")).toBeNull();
    expect(resolverIntencaoComercialLanding("quero pagar")).toBeNull();
  });

  it("preço adulterado na mensagem não muda o plano reconhecido nem é usado pra nada", () => {
    // A função nem olha pro número — só pras palavras "individual"/"essencial"/"pro"/"anual".
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual de R$1,00 por mês.")).toBe("INDIVIDUAL_MENSAL");
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual de R$999999 por mês.")).toBe("INDIVIDUAL_MENSAL");
  });

  it("ignora texto vazio/nulo/indefinido", () => {
    expect(resolverIntencaoComercialLanding("")).toBeNull();
    expect(resolverIntencaoComercialLanding(null)).toBeNull();
    expect(resolverIntencaoComercialLanding(undefined)).toBeNull();
  });

  it("ignora mensagem muito longa (evita falso positivo em texto que só cita a palavra de passagem)", () => {
    const textoLongo = "Individual ".repeat(30) + "e no meio de um texto bem mais longo que uma mensagem de CTA jamais seria, cito a palavra essencial também";
    expect(resolverIntencaoComercialLanding(textoLongo)).toBeNull();
  });
});

describe("mensagemConfirmacaoOferta", () => {
  it("plano mensal menciona o valor e a opção de pagamento anual", () => {
    const texto = mensagemConfirmacaoOferta("INDIVIDUAL_MENSAL");
    expect(texto).toContain("89,90");
    expect(texto).toContain("anual");
  });

  it("Essencial mensal menciona o valor certo", () => {
    const texto = mensagemConfirmacaoOferta("ESSENCIAL_MENSAL");
    expect(texto).toContain("149,90");
  });

  it("plano anual (cartão ou Pix) sempre menciona as duas formas de pagamento, pro mesmo tier", () => {
    const textoCartao = mensagemConfirmacaoOferta("PRO_ANUAL_PARCELADO");
    const textoPix = mensagemConfirmacaoOferta("PRO_ANUAL_PIX");
    expect(textoCartao).toContain("cartão");
    expect(textoCartao).toContain("Pix");
    expect(textoCartao).toContain("Pro");
    expect(textoPix).toEqual(textoCartao); // mesma mensagem — a escolha acontece só no gate
  });
});

describe("MENSAGEM_INTERESSE_EMPRESAS", () => {
  it("nunca menciona preço nem gera checkout — é só interesse comercial", () => {
    expect(MENSAGEM_INTERESSE_EMPRESAS).not.toMatch(/r\$\s?\d/i);
  });
});
