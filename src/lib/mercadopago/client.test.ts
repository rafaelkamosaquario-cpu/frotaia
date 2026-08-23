import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

const { validarAssinaturaWebhook, decodificarReferenciaExterna } = await import("./client");

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
