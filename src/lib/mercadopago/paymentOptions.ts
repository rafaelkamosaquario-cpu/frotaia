import { CATALOGO_OFERTAS, type OfertaPlano } from "./catalog";

export type MetodoCheckout = "recorrente" | "pix" | "credito" | "debito";
export function isMetodoCheckout(value: string): value is MetodoCheckout {
  return ["recorrente", "pix", "credito", "debito"].includes(value);
}

/** Debit is conditional on provider/card eligibility, never a promise of all banks. */
export function paymentMethods(metodo: Exclude<MetodoCheckout, "recorrente">, plano: OfertaPlano) {
  const accepted = metodo === "pix" ? "bank_transfer" : metodo === "credito" ? "credit_card" : "debit_card";
  return {
    excluded_payment_types: ["credit_card", "debit_card", "bank_transfer", "ticket", "atm", "prepaid_card"]
      .filter((id) => id !== accepted).map((id) => ({ id })),
    installments: metodo === "credito" ? CATALOGO_OFERTAS[plano].parcelas ?? 1 : 1,
    ...(metodo === "pix" ? { default_payment_method_id: "pix" } : {}),
  };
}

/** One calendar month, clamped at month end; annual terms retain existing 365-day rule. */
export function validadePagamentoAvulso(plano: OfertaPlano, approvedAt: string): string {
  const date = new Date(approvedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Data de aprovação inválida.");
  if (CATALOGO_OFERTAS[plano].cobranca === "unica") return new Date(date.getTime() + 365 * 86400000).toISOString();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}
