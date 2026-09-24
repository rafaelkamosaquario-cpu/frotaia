import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const verify = vi.fn();
const company = vi.fn();
const mensal = vi.fn();
const anual = vi.fn();
vi.mock("@/services/whatsapp/checkoutLinkToken", () => ({ verifyCheckoutLinkToken: (...args: unknown[]) => verify(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/services/supabase/companyService", () => ({ getCompany: (...args: unknown[]) => company(...args) }));
vi.mock("@/lib/mercadopago/client", () => ({ criarAssinaturaMensal: (...args: unknown[]) => mensal(...args), criarPagamentoAnual: (...args: unknown[]) => anual(...args) }));
import { criarCheckoutAction } from "./actions";
describe("autorização do checkout", () => {
  it.each(["pix", "credito", "debito"])("permite mensal %s sem exigir e-mail da recorrência", async (metodo) => {
    anual.mockResolvedValue({ id: "fake", initPoint: "https://www.mercadopago.com.br/checkout" });
    expect(await criarCheckoutAction("token", "PRO_MENSAL", undefined, metodo)).toHaveProperty("initPoint");
    expect(anual).toHaveBeenCalledWith({ companyId: "empresa-assinada", plano: "PRO_MENSAL", metodo });
    expect(mensal).not.toHaveBeenCalled();
  });
  it("rejeita método desconhecido e anual recorrente", async () => {
    expect(await criarCheckoutAction("token", "PRO_MENSAL", undefined, "boleto")).toHaveProperty("error");
    expect(await criarCheckoutAction("token", "PRO_ANUAL_PIX", undefined, "recorrente")).toHaveProperty("error");
    expect(anual).not.toHaveBeenCalled();
  });
  beforeEach(() => { vi.resetAllMocks(); verify.mockReturnValue({ companyId: "empresa-assinada" }); company.mockResolvedValue({ id: "empresa-assinada" }); mensal.mockResolvedValue({ initPoint: "https://www.mercadopago.com.br/subscriptions/checkout" }); });
  it("rejeita companyId arbitrário ou token expirado antes de acessar o banco", async () => {
    verify.mockImplementation(() => { throw new Error("inválido"); });
    expect(await criarCheckoutAction("empresa-alheia", "INDIVIDUAL_MENSAL", "teste@example.com")).toHaveProperty("error");
    expect(company).not.toHaveBeenCalled(); expect(mensal).not.toHaveBeenCalled();
  });
  it("usa somente a empresa do token validado", async () => {
    expect(await criarCheckoutAction("token", "INDIVIDUAL_MENSAL", "teste@example.com")).toHaveProperty("initPoint");
    expect(mensal).toHaveBeenCalledWith({ companyId: "empresa-assinada", plano: "INDIVIDUAL_MENSAL", email: "teste@example.com" });
  });
  it("rejeita plano desconhecido", async () => {
    expect(await criarCheckoutAction("token", "GRATIS", "teste@example.com")).toHaveProperty("error"); expect(mensal).not.toHaveBeenCalled();
  });
  it("retorna erro recuperável se Mercado Pago falha", async () => {
    mensal.mockRejectedValue(new Error("simulado"));
    expect(await criarCheckoutAction("token", "INDIVIDUAL_MENSAL", "teste@example.com")).toHaveProperty("error");
  });
});
