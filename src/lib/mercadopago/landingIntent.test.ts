import { describe, it, expect } from "vitest";
import { resolverIntencaoComercialLanding, mensagemConfirmacaoOferta, MENSAGEM_INTERESSE_EMPRESAS } from "./landingIntent";

/**
 * Reconhecimento das mensagens dos CTAs da landing (08/2026). Cobertura
 * central: o texto nunca determina o preço, só a CHAVE do plano — mesmo
 * que o valor mencionado na mensagem seja adulterado, a função ignora
 * completamente o número.
 */

describe("resolverIntencaoComercialLanding", () => {
  it("reconhece a mensagem oficial do CTA Individual", () => {
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual de R$79,90 por mês.")).toBe("MENSAL");
  });

  it("reconhece a mensagem oficial do CTA Gestão (anual) sem decidir cartão/Pix", () => {
    expect(resolverIntencaoComercialLanding("Quero contratar o Frota IA Gestão anual.")).toBe("ANUAL_PARCELADO");
  });

  it("reconhece Gestão Mensal quando explicitamente mencionado", () => {
    expect(resolverIntencaoComercialLanding("Quero o Frota IA Gestão mensal")).toBe("GESTAO_MENSAL");
  });

  it("reconhece a mensagem oficial do CTA Empresas", () => {
    expect(resolverIntencaoComercialLanding("Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos.")).toBe("EMPRESAS");
  });

  it("mensagem genérica 'quero assinar' não é reconhecida como nenhuma oferta específica (segue pro fluxo normal, IA apresenta as opções)", () => {
    expect(resolverIntencaoComercialLanding("quero assinar")).toBeNull();
    expect(resolverIntencaoComercialLanding("quais planos vocês têm?")).toBeNull();
    expect(resolverIntencaoComercialLanding("quero pagar")).toBeNull();
  });

  it("preço adulterado na mensagem não muda o plano reconhecido nem é usado pra nada", () => {
    // A função nem olha pro número — só pra palavra "individual".
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual de R$1,00 por mês.")).toBe("MENSAL");
    expect(resolverIntencaoComercialLanding("Quero assinar o Frota IA Individual de R$999999 por mês.")).toBe("MENSAL");
  });

  it("ignora texto vazio/nulo/indefinido", () => {
    expect(resolverIntencaoComercialLanding("")).toBeNull();
    expect(resolverIntencaoComercialLanding(null)).toBeNull();
    expect(resolverIntencaoComercialLanding(undefined)).toBeNull();
  });

  it("ignora mensagem muito longa (evita falso positivo em texto que só cita a palavra de passagem)", () => {
    const textoLongo = "Individual ".repeat(30) + "e no meio de um texto bem mais longo que uma mensagem de CTA jamais seria, cito a palavra gestão também";
    expect(resolverIntencaoComercialLanding(textoLongo)).toBeNull();
  });
});

describe("mensagemConfirmacaoOferta", () => {
  it("Individual menciona o upsell do painel", () => {
    const texto = mensagemConfirmacaoOferta("MENSAL");
    expect(texto).toContain("79,90");
    expect(texto).toContain("Painel de Gestão");
  });

  it("Gestão Mensal não menciona upsell (já é o plano com painel)", () => {
    const texto = mensagemConfirmacaoOferta("GESTAO_MENSAL");
    expect(texto).toContain("99,90");
    expect(texto).not.toContain("upsell");
  });

  it("Gestão anual (cartão ou Pix) sempre menciona as duas formas de pagamento", () => {
    const textoCartao = mensagemConfirmacaoOferta("ANUAL_PARCELADO");
    const textoPix = mensagemConfirmacaoOferta("ANUAL_PIX");
    expect(textoCartao).toContain("cartão");
    expect(textoCartao).toContain("Pix");
    expect(textoPix).toEqual(textoCartao); // mesma mensagem — a escolha acontece só no gate
  });
});

describe("MENSAGEM_INTERESSE_EMPRESAS", () => {
  it("nunca menciona preço nem gera checkout — é só interesse comercial", () => {
    expect(MENSAGEM_INTERESSE_EMPRESAS).not.toMatch(/r\$\s?\d/i);
  });
});
