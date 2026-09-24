import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./actions", () => ({ criarCheckoutAction: vi.fn() }));
import { CheckoutGate } from "./CheckoutGate";
import { PLANOS_AUTOATENDIMENTO } from "@/lib/mercadopago/catalog";

describe("contratação: meios visíveis em todas as ofertas", () => {
  it.each(PLANOS_AUTOATENDIMENTO)("%s oferece Pix, crédito e débito com ressalva", (plano) => {
    const html = renderToStaticMarkup(React.createElement(CheckoutGate, { checkoutToken: "test-only", companyName: "Empresa de teste", planoPreSelecionado: plano }));
    expect(html).toContain("Cartão de crédito");
    expect(html).toContain("Cartão de débito");
    expect(html).toContain("Pix");
    expect(html).toContain("Somente cartões disponibilizados pelo Mercado Pago");
    if (plano.includes("MENSAL")) expect(html).toContain("Crédito com renovação automática");
    else expect(html).not.toContain("Crédito com renovação automática");
  });
});
