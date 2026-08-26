import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Testa o branching da rota (config ausente, assinatura inválida, tipo de
 * evento, mapeamento de status) com tudo externo mockado. A validação de
 * assinatura em si (HMAC/manifest) já tem cobertura própria em
 * client.test.ts — aqui ela é mockada pra isolar a lógica da rota.
 */

const isMercadoPagoConfigured = vi.fn();
const getMercadoPagoWebhookSecret = vi.fn();
const validarAssinaturaWebhook = vi.fn();
const buscarPagamento = vi.fn();
const buscarAssinatura = vi.fn();
const cancelarAssinatura = vi.fn();
const atualizarAssinaturaPorPagamento = vi.fn();
const registrarEventoPagamento = vi.fn();
const eventoPagamentoJaProcessado = vi.fn();
const getSubscription = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/mercadopago/config", () => ({
  isMercadoPagoConfigured: () => isMercadoPagoConfigured(),
  getMercadoPagoWebhookSecret: () => getMercadoPagoWebhookSecret(),
}));
vi.mock("@/lib/mercadopago/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mercadopago/client")>("@/lib/mercadopago/client");
  return {
    ...actual,
    validarAssinaturaWebhook: (...args: unknown[]) => validarAssinaturaWebhook(...args),
    buscarPagamento: (...args: unknown[]) => buscarPagamento(...args),
    buscarAssinatura: (...args: unknown[]) => buscarAssinatura(...args),
    cancelarAssinatura: (...args: unknown[]) => cancelarAssinatura(...args),
  };
});
vi.mock("@/services/supabase/subscriptionService", () => ({
  atualizarAssinaturaPorPagamento: (...args: unknown[]) => atualizarAssinaturaPorPagamento(...args),
  registrarEventoPagamento: (...args: unknown[]) => registrarEventoPagamento(...args),
  eventoPagamentoJaProcessado: (...args: unknown[]) => eventoPagamentoJaProcessado(...args),
  getSubscription: (...args: unknown[]) => getSubscription(...args),
}));

function chamarWebhook(opts: { body?: unknown; dataId?: string; type?: string; xSignature?: string; xRequestId?: string }) {
  const params = new URLSearchParams();
  if (opts.dataId) params.set("data.id", opts.dataId);
  if (opts.type) params.set("type", opts.type);
  const url = `https://app.example.com/api/payments/mercadopago/webhook${params.toString() ? `?${params}` : ""}`;

  const headers: Record<string, string> = {};
  if (opts.xSignature) headers["x-signature"] = opts.xSignature;
  if (opts.xRequestId) headers["x-request-id"] = opts.xRequestId;

  return async () => {
    const { POST } = await import("./route");
    return POST(new Request(url, { method: "POST", headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }));
  };
}

describe("POST /api/payments/mercadopago/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMercadoPagoConfigured.mockReturnValue(true);
    getMercadoPagoWebhookSecret.mockReturnValue("segredo");
    validarAssinaturaWebhook.mockReturnValue(true);
    eventoPagamentoJaProcessado.mockResolvedValue(false);
    getSubscription.mockResolvedValue(null);
    cancelarAssinatura.mockResolvedValue(undefined);
  });

  it("503 quando o Mercado Pago não está configurado", async () => {
    isMercadoPagoConfigured.mockReturnValue(false);
    const resposta = await chamarWebhook({})();
    expect(resposta.status).toBe(503);
  });

  it("503 quando MERCADOPAGO_WEBHOOK_SECRET não está configurado", async () => {
    getMercadoPagoWebhookSecret.mockReturnValue(null);
    const resposta = await chamarWebhook({})();
    expect(resposta.status).toBe(503);
  });

  it("401 quando a assinatura é inválida", async () => {
    validarAssinaturaWebhook.mockReturnValue(false);
    const resposta = await chamarWebhook({ dataId: "1", type: "payment" })();
    expect(resposta.status).toBe(401);
    expect(buscarPagamento).not.toHaveBeenCalled();
  });

  it("200 sem processar nada quando não há data.id nem no body nem na query", async () => {
    const resposta = await chamarWebhook({ body: { type: "payment" } })();
    expect(resposta.status).toBe(200);
    expect(buscarPagamento).not.toHaveBeenCalled();
  });

  it("payment aprovado de plano anual ativa a assinatura e libera o Painel de Gestão", async () => {
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PIX", valorCentavos: 79900 });

    const resposta = await chamarWebhook({ dataId: "pay-1", type: "payment", body: { type: "payment", data: { id: "pay-1" } } })();

    expect(resposta.status).toBe(200);
    expect(registrarEventoPagamento).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId: "empresa-1", statusRecebido: "approved" }));
    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ companyId: "empresa-1", plan: "ANUAL_PIX", status: "ATIVA", fleetPanelIncluded: true, valorCentavos: 79900 })
    );
  });

  it("payment aprovado de ANUAL_PARCELADO também libera o Painel de Gestão", async () => {
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PARCELADO", valorCentavos: 83880 });

    await chamarWebhook({ dataId: "pay-1b", type: "payment", body: { type: "payment", data: { id: "pay-1b" } } })();

    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ plan: "ANUAL_PARCELADO", fleetPanelIncluded: true })
    );
  });

  it("payment de mesmo id + status já processado não reaplica a assinatura (idempotência)", async () => {
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PIX", valorCentavos: 79900 });
    eventoPagamentoJaProcessado.mockResolvedValue(true);

    const resposta = await chamarWebhook({ dataId: "pay-1", type: "payment", body: { type: "payment", data: { id: "pay-1" } } })();

    expect(resposta.status).toBe(200);
    expect(registrarEventoPagamento).toHaveBeenCalled(); // continua logando, só não reaplica
    expect(atualizarAssinaturaPorPagamento).not.toHaveBeenCalled();
  });

  it("payment aprovado de plano MENSAL não atualiza a assinatura (isso vem só do evento de preapproval)", async () => {
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|MENSAL", valorCentavos: 7990 });

    await chamarWebhook({ dataId: "pay-2", type: "payment", body: { type: "payment", data: { id: "pay-2" } } })();

    expect(registrarEventoPagamento).toHaveBeenCalled();
    expect(atualizarAssinaturaPorPagamento).not.toHaveBeenCalled();
  });

  it("payment pendente registra o evento mas não ativa nada", async () => {
    buscarPagamento.mockResolvedValue({ status: "pending", externalReference: "empresa-1|ANUAL_PARCELADO", valorCentavos: 71880 });

    await chamarWebhook({ dataId: "pay-3", type: "payment", body: { type: "payment", data: { id: "pay-3" } } })();

    expect(registrarEventoPagamento).toHaveBeenCalled();
    expect(atualizarAssinaturaPorPagamento).not.toHaveBeenCalled();
  });

  it("preapproval authorized ativa o plano mensal (Individual), sem painel, e limpa valido_ate residual do trial", async () => {
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-2|MENSAL" });

    await chamarWebhook({ dataId: "sub-1", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-1" } } })();

    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId: "empresa-2",
        plan: "MENSAL",
        status: "ATIVA",
        fleetPanelIncluded: false,
        mercadopagoSubscriptionId: "sub-1",
        validoAte: null, // regressão: sem isso, a validade de +7 dias do trial ficaria intocada e bloquearia o cliente pago depois
      })
    );
  });

  it("preapproval authorized de GESTAO_MENSAL ativa o plano certo (não mais hardcoded como MENSAL), libera o painel e limpa valido_ate residual do trial", async () => {
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-3|GESTAO_MENSAL" });

    await chamarWebhook({ dataId: "sub-3", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-3" } } })();

    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ companyId: "empresa-3", plan: "GESTAO_MENSAL", status: "ATIVA", fleetPanelIncluded: true, validoAte: null })
    );
  });

  it("preapproval de mesmo id + status já processado não reaplica a assinatura (idempotência)", async () => {
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-3|GESTAO_MENSAL" });
    eventoPagamentoJaProcessado.mockResolvedValue(true);

    const resposta = await chamarWebhook({ dataId: "sub-3", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-3" } } })();

    expect(resposta.status).toBe(200);
    expect(registrarEventoPagamento).toHaveBeenCalled(); // continua logando, só não reaplica
    expect(atualizarAssinaturaPorPagamento).not.toHaveBeenCalled();
  });

  it("preapproval cancelled cancela a assinatura, revoga o painel e não mexe em valido_ate", async () => {
    buscarAssinatura.mockResolvedValue({ status: "cancelled", externalReference: "empresa-2|GESTAO_MENSAL" });

    await chamarWebhook({ dataId: "sub-2", type: "preapproval", body: { type: "preapproval", data: { id: "sub-2" } } })();

    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "CANCELADA", fleetPanelIncluded: false, validoAte: undefined })
    );
  });

  it("tipo de evento desconhecido: 200, sem chamar nada", async () => {
    const resposta = await chamarWebhook({ dataId: "x-1", type: "merchant_order", body: { type: "merchant_order", data: { id: "x-1" } } })();
    expect(resposta.status).toBe(200);
    expect(buscarPagamento).not.toHaveBeenCalled();
    expect(buscarAssinatura).not.toHaveBeenCalled();
  });

  it("erro ao consultar a API do Mercado Pago não derruba a rota (responde 200 mesmo assim)", async () => {
    buscarPagamento.mockRejectedValue(new Error("Mercado Pago fora do ar"));
    const resposta = await chamarWebhook({ dataId: "pay-4", type: "payment", body: { type: "payment", data: { id: "pay-4" } } })();
    expect(resposta.status).toBe(200);
  });
});

describe("Troca de plano — cancelamento da assinatura anterior no Mercado Pago (fechamento 08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMercadoPagoConfigured.mockReturnValue(true);
    getMercadoPagoWebhookSecret.mockReturnValue("segredo");
    validarAssinaturaWebhook.mockReturnValue(true);
    eventoPagamentoJaProcessado.mockResolvedValue(false);
    cancelarAssinatura.mockResolvedValue(undefined);
  });

  it("A) Individual (MENSAL) → Gestão Mensal: cancela o preapproval antigo DEPOIS de confirmar o novo ativo", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo-mensal" });
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|GESTAO_MENSAL" });

    const ordem: string[] = [];
    atualizarAssinaturaPorPagamento.mockImplementation(async () => {
      ordem.push("atualizou");
      return {};
    });
    cancelarAssinatura.mockImplementation(async () => {
      ordem.push("cancelou");
    });

    await chamarWebhook({ dataId: "sub-novo-gestao", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-novo-gestao" } } })();

    expect(cancelarAssinatura).toHaveBeenCalledWith("sub-antigo-mensal");
    expect(ordem).toEqual(["atualizou", "cancelou"]); // nunca cancela antes de confirmar o novo — regra de segurança explícita
  });

  it("B) Individual → Gestão Anual cartão: cancela o preapproval antigo (o pagamento novo é único, vem por 'payment', não 'preapproval')", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo-mensal" });
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PARCELADO", valorCentavos: 83880 });

    await chamarWebhook({ dataId: "pay-anual", type: "payment", body: { type: "payment", data: { id: "pay-anual" } } })();

    expect(cancelarAssinatura).toHaveBeenCalledWith("sub-antigo-mensal");
  });

  it("C) Individual → Gestão Anual Pix: mesmo comportamento do cartão", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo-mensal" });
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PIX", valorCentavos: 79900 });

    await chamarWebhook({ dataId: "pay-pix", type: "payment", body: { type: "payment", data: { id: "pay-pix" } } })();

    expect(cancelarAssinatura).toHaveBeenCalledWith("sub-antigo-mensal");
  });

  it("D) Gestão Mensal → Gestão Anual: mesmo mecanismo, preapproval do Gestão Mensal é cancelado", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-gestao-mensal" });
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PARCELADO", valorCentavos: 83880 });

    await chamarWebhook({ dataId: "pay-upgrade-anual", type: "payment", body: { type: "payment", data: { id: "pay-upgrade-anual" } } })();

    expect(cancelarAssinatura).toHaveBeenCalledWith("sub-gestao-mensal");
  });

  it("F) Renovação de anual expirado: sem preapproval anterior (anual nunca seta mercadopago_subscription_id) — nunca tenta cancelar nada", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: null });
    buscarPagamento.mockResolvedValue({ status: "approved", externalReference: "empresa-1|ANUAL_PIX", valorCentavos: 79900 });

    await chamarWebhook({ dataId: "pay-renovacao", type: "payment", body: { type: "payment", data: { id: "pay-renovacao" } } })();

    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("cliente novo (sem assinatura anterior nenhuma) nunca tenta cancelar nada", async () => {
    getSubscription.mockResolvedValue(null);
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-nova|MENSAL" });

    await chamarWebhook({ dataId: "sub-primeira", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-primeira" } } })();

    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("mesmo preapproval reportando mudança de status (ex.: pending→authorized) NUNCA cancela a si mesmo", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-mesma" });
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|MENSAL" });

    await chamarWebhook({ dataId: "sub-mesma", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-mesma" } } })();

    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("evento de preapproval CANCELADA (não ATIVA) nunca dispara cancelamento de uma OUTRA assinatura", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-outra-coisa" });
    buscarAssinatura.mockResolvedValue({ status: "cancelled", externalReference: "empresa-1|GESTAO_MENSAL" });

    await chamarWebhook({ dataId: "sub-cancelada", type: "preapproval", body: { type: "preapproval", data: { id: "sub-cancelada" } } })();

    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("idempotência: webhook duplicado (já processado) nunca reprocessa nem tenta cancelar de novo", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo" });
    eventoPagamentoJaProcessado.mockResolvedValue(true);
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|GESTAO_MENSAL" });

    await chamarWebhook({ dataId: "sub-novo", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-novo" } } })();

    expect(getSubscription).not.toHaveBeenCalled();
    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("falha ao cancelar a assinatura anterior nunca derruba a resposta do webhook nem desfaz a ativação da nova (best-effort)", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo-mensal" });
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|GESTAO_MENSAL" });
    cancelarAssinatura.mockRejectedValue(new Error("Mercado Pago recusou o cancelamento"));

    const resposta = await chamarWebhook({ dataId: "sub-x", type: "subscription_preapproval", body: { type: "subscription_preapproval", data: { id: "sub-x" } } })();

    expect(resposta.status).toBe(200);
    expect(atualizarAssinaturaPorPagamento).toHaveBeenCalled(); // a nova assinatura já foi ativada, apesar da falha no cancelamento
  });

  it("falha antes do pagamento (evento com status não-aprovado) nunca ativa nem tenta cancelar nada", async () => {
    getSubscription.mockResolvedValue({ mercadopago_subscription_id: "sub-antigo-mensal" });
    buscarPagamento.mockResolvedValue({ status: "rejected", externalReference: "empresa-1|ANUAL_PIX", valorCentavos: 79900 });

    await chamarWebhook({ dataId: "pay-rejeitado", type: "payment", body: { type: "payment", data: { id: "pay-rejeitado" } } })();

    expect(atualizarAssinaturaPorPagamento).not.toHaveBeenCalled();
    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });
});
