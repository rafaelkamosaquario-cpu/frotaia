import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

const { validarAssinaturaWebhook, decodificarReferenciaExterna, cancelarAssinatura, classificarErroCancelamento, MercadoPagoApiError } = await import(
  "./client"
);

/**
 * Cobre a lógica de validação de assinatura (manifest + HMAC-SHA256) contra
 * o formato confirmado na documentação oficial do Mercado Pago em
 * 06/08/2026 — não recalcula um vetor de teste oficial deles (os exemplos
 * públicos usam hash de exemplo, não uma chave real), mas garante que a
 * função aceita uma assinatura calculada corretamente com o mesmo algoritmo
 * e rejeita qualquer adulteração de manifest/segredo/hash.
 */

const SECRET = "segredo-de-teste";

function assinar(manifest: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("validarAssinaturaWebhook", () => {
  it("aceita uma assinatura válida com os 3 componentes presentes", () => {
    const ts = "1700000000000";
    const manifest = `id:123456;request-id:req-abc;ts:${ts};`;
    const hash = assinar(manifest);

    const valido = validarAssinaturaWebhook({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: "req-abc",
      dataIdQueryParam: "123456",
      secret: SECRET,
    });
    expect(valido).toBe(true);
  });

  it("compara data.id em minúsculas (o parâmetro pode vir em qualquer caixa)", () => {
    const ts = "1700000000000";
    const manifest = `id:abc123;request-id:req-1;ts:${ts};`; // manifest sempre em minúsculas
    const hash = assinar(manifest);

    const valido = validarAssinaturaWebhook({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: "req-1",
      dataIdQueryParam: "ABC123",
      secret: SECRET,
    });
    expect(valido).toBe(true);
  });

  it("omite pares ausentes do manifest (ex.: sem x-request-id)", () => {
    const ts = "1700000000000";
    const manifest = `id:123456;ts:${ts};`; // sem "request-id:" porque o header não veio
    const hash = assinar(manifest);

    const valido = validarAssinaturaWebhook({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: null,
      dataIdQueryParam: "123456",
      secret: SECRET,
    });
    expect(valido).toBe(true);
  });

  it("rejeita quando o hash não bate (adulteração/segredo errado)", () => {
    const ts = "1700000000000";
    const hash = assinar(`id:123456;request-id:req-abc;ts:${ts};`, "segredo-errado");

    const valido = validarAssinaturaWebhook({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: "req-abc",
      dataIdQueryParam: "123456",
      secret: SECRET,
    });
    expect(valido).toBe(false);
  });

  it("rejeita quando data.id foi adulterado depois de assinado (o hash não cobre mais o novo valor)", () => {
    const ts = "1700000000000";
    const hash = assinar(`id:123456;request-id:req-abc;ts:${ts};`);

    const valido = validarAssinaturaWebhook({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: "req-abc",
      dataIdQueryParam: "999999", // id diferente do que foi assinado
      secret: SECRET,
    });
    expect(valido).toBe(false);
  });

  it("rejeita quando x-signature está ausente", () => {
    const valido = validarAssinaturaWebhook({ xSignature: null, xRequestId: "req-abc", dataIdQueryParam: "123456", secret: SECRET });
    expect(valido).toBe(false);
  });

  it("rejeita quando x-signature não tem ts ou v1", () => {
    const valido = validarAssinaturaWebhook({ xSignature: "ts=1700000000000", xRequestId: "req-abc", dataIdQueryParam: "123456", secret: SECRET });
    expect(valido).toBe(false);
  });
});

describe("decodificarReferenciaExterna", () => {
  it("decodifica companyId e plano do formato 'companyId|PLANO'", () => {
    expect(decodificarReferenciaExterna("empresa-1|MENSAL")).toEqual({ companyId: "empresa-1", plano: "MENSAL" });
    expect(decodificarReferenciaExterna("empresa-2|ANUAL_PIX")).toEqual({ companyId: "empresa-2", plano: "ANUAL_PIX" });
    expect(decodificarReferenciaExterna("empresa-3|GESTAO_MENSAL")).toEqual({ companyId: "empresa-3", plano: "GESTAO_MENSAL" });
  });

  it("devolve null pra formato inválido (sem separador, plano desconhecido)", () => {
    expect(decodificarReferenciaExterna("sem-separador")).toBeNull();
    expect(decodificarReferenciaExterna("empresa-1|PLANO_INEXISTENTE")).toBeNull();
    expect(decodificarReferenciaExterna("")).toBeNull();
  });
});

describe("cancelarAssinatura — fechamento de troca de plano (08/2026)", () => {
  const originalToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "token-de-teste";
  });

  afterEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = originalToken;
    global.fetch = originalFetch;
  });

  it("chama PUT /v1/preapproval/{id} com status=cancelled — API real confirmada na documentação oficial do Mercado Pago", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await cancelarAssinatura("preapproval-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/v1/preapproval/preapproval-123",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      })
    );
  });

  it("lança MercadoPagoApiError sem incluir o corpo da resposta quando a API recusa (mesmo padrão de segurança das outras chamadas)", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "dado sensível de pagador" }), { status: 400 })) as unknown as typeof fetch;

    await expect(cancelarAssinatura("preapproval-invalido")).rejects.toThrow("Falha na comunicação com o Mercado Pago.");
  });

  it("codifica o id na URL (nunca interpola direto — proteção contra id malformado)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await cancelarAssinatura("id com espaço/barra");

    const urlChamada = fetchMock.mock.calls[0][0] as string;
    expect(urlChamada).toBe(`https://api.mercadopago.com/v1/preapproval/${encodeURIComponent("id com espaço/barra")}`);
  });
});

describe("classificarErroCancelamento — fechamento final do risco residual (08/2026)", () => {
  it("timeout/erro de rede (sem httpStatus) é tratado como transitório — retry é seguro", () => {
    expect(classificarErroCancelamento(new TypeError("fetch failed"))).toBe("transitorio");
  });

  it("429 (rate limit) é transitório", () => {
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 429))).toBe("transitorio");
  });

  it("5xx é transitório", () => {
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 500))).toBe("transitorio");
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 503))).toBe("transitorio");
  });

  it("400/401/403/404 são permanentes — retry nunca resolveria sozinho", () => {
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 400))).toBe("permanente");
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 401))).toBe("permanente");
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 403))).toBe("permanente");
    expect(classificarErroCancelamento(new MercadoPagoApiError("x", 404))).toBe("permanente");
  });
});
