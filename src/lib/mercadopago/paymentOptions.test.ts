import { describe, expect, it } from "vitest";
import { paymentMethods, validadePagamentoAvulso } from "./paymentOptions";
import { PLANOS_AUTOATENDIMENTO, CATALOGO_OFERTAS } from "./catalog";

describe("meios de pagamento em todos os planos", () => {
  for (const plano of PLANOS_AUTOATENDIMENTO) {
    for (const metodo of ["pix", "credito", "debito"] as const) {
      it(`${plano}: ${metodo}`, () => {
        const config = paymentMethods(metodo, plano);
        const excluded = config.excluded_payment_types.map((item) => item.id);
        expect(excluded).not.toContain(metodo === "pix" ? "bank_transfer" : metodo === "credito" ? "credit_card" : "debit_card");
        if (metodo !== "credito" || CATALOGO_OFERTAS[plano].cobranca === "recorrente") expect(config.installments).toBe(1);
        if (metodo === "pix") expect(config.default_payment_method_id).toBe("pix");
      });
    }
  }
  it("mensal avulso não libera um ano e limita fim do mês", () => {
    expect(validadePagamentoAvulso("INDIVIDUAL_MENSAL", "2026-01-31T10:00:00Z")).toBe("2026-02-28T10:00:00.000Z");
    expect(validadePagamentoAvulso("PRO_MENSAL", "2026-09-24T10:00:00Z")).toBe("2026-10-24T10:00:00.000Z");
  });
});
