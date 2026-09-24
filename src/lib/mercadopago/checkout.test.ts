import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ getMercadoPagoConfig: () => ({ MERCADOPAGO_ACCESS_TOKEN: "fake-test-token" }) }));
import { criarAssinaturaMensal, criarPagamentoAnual, decodificarReferenciaExterna } from "./client";
afterEach(() => vi.unstubAllGlobals());
describe("criação de checkout sem cobrança real", () => {
  it.each(["pix", "credito", "debito"] as const)("mensal %s cria preferência avulsa com preço de catálogo", async (metodo) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "fake", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect" })));
    vi.stubGlobal("fetch", fetch);
    await criarPagamentoAnual({ companyId: "company", plano: "INDIVIDUAL_MENSAL", metodo });
    expect(fetch.mock.calls[0][0]).toContain("/checkout/preferences");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.external_reference).toBe("company|INDIVIDUAL_MENSAL|AVULSO");
    expect(body.items[0].unit_price).toBe(89.9);
    expect(body.auto_recurring).toBeUndefined();
  });
  it("preserva referências antigas e rejeita modos não conhecidos", () => {
    expect(decodificarReferenciaExterna("c|PRO_MENSAL")).toEqual({ companyId: "c", plano: "PRO_MENSAL" });
    expect(decodificarReferenciaExterna("c|PRO_MENSAL|AVULSO")).toEqual({ companyId: "c", plano: "PRO_MENSAL", avulso: true });
    expect(decodificarReferenciaExterna("c|PRO_MENSAL|GRATIS")).toBeNull();
  });
  it("envia assinatura pending, preço de catálogo e prazo limite", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "fake", init_point: "https://www.mercadopago.com.br/subscriptions/checkout" })));
    vi.stubGlobal("fetch", fetch);
    await criarAssinaturaMensal({ companyId: "company", email: "test@example.com", plano: "INDIVIDUAL_MENSAL" });
    const options = fetch.mock.calls[0][1];
    expect(JSON.parse(options.body)).toMatchObject({ status: "pending", auto_recurring: { transaction_amount: 89.9 } });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([undefined, "http://www.mercadopago.com.br/x", "https://evil.example/x"])("rejeita link inválido: %s", async (url) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "fake", init_point: url }))));
    await expect(criarPagamentoAnual({ companyId: "company", plano: "INDIVIDUAL_ANUAL_PIX" })).rejects.toThrow("link de pagamento válido");
  });
});
