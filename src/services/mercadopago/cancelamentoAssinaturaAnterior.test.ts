import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const cancelarAssinatura = vi.fn();
const buscarAssinatura = vi.fn();
const registrarTentativaCancelamentoPendente = vi.fn();
const resolverCancelamentoPendente = vi.fn();

vi.mock("@/lib/mercadopago/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mercadopago/client")>("@/lib/mercadopago/client");
  return {
    ...actual, // classificarErroCancelamento e MercadoPagoApiError continuam reais — é a lógica que este arquivo mais precisa exercitar de verdade
    cancelarAssinatura: (...args: unknown[]) => cancelarAssinatura(...args),
    buscarAssinatura: (...args: unknown[]) => buscarAssinatura(...args),
  };
});
vi.mock("@/services/supabase/subscriptionService", () => ({
  registrarTentativaCancelamentoPendente: (...args: unknown[]) => registrarTentativaCancelamentoPendente(...args),
  resolverCancelamentoPendente: (...args: unknown[]) => resolverCancelamentoPendente(...args),
}));

import { cancelarComRecuperacao, reconciliarCancelamentoPendente } from "./cancelamentoAssinaturaAnterior";
import { MercadoPagoApiError } from "@/lib/mercadopago/client";
import type { SupabaseDbClient } from "@/services/supabase/types";
import type { PendingPreapprovalCancellation } from "@/services/supabase/subscriptionService";

const ADMIN = {} as SupabaseDbClient;
const ROTA = "/teste";

describe("cancelarComRecuperacao — fechamento final do risco residual (08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrarTentativaCancelamentoPendente.mockResolvedValue(undefined);
    resolverCancelamentoPendente.mockResolvedValue(undefined);
  });

  it("7. sucesso: resolve a pendência (se houver) e nunca persiste falha", async () => {
    cancelarAssinatura.mockResolvedValue(undefined);

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 0);

    expect(resultado).toBe("cancelado");
    expect(resolverCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo");
    expect(registrarTentativaCancelamentoPendente).not.toHaveBeenCalled();
  });

  it("8. timeout (erro de rede, sem httpStatus): tratado como transitório, fica pending", async () => {
    cancelarAssinatura.mockRejectedValue(new TypeError("fetch failed"));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 0);

    expect(resultado).toBe("pendente");
    expect(registrarTentativaCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo", "pending", expect.any(String));
  });

  it("9. HTTP 500 do Mercado Pago: transitório, fica pending (não esgotou tentativas)", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 500));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 1);

    expect(resultado).toBe("pendente");
    expect(registrarTentativaCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo", "pending", expect.any(String));
  });

  it("10. HTTP 429 (rate limit) do Mercado Pago: transitório, fica pending", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 429));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 0);

    expect(resultado).toBe("pendente");
    expect(registrarTentativaCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo", "pending", expect.any(String));
  });

  it("11. o próprio Mercado Pago já reporta a assinatura como cancelada (idempotente do lado deles) — cancelarAssinatura não lança nesse caso, então segue como sucesso", async () => {
    cancelarAssinatura.mockResolvedValue(undefined); // client.ts não trata isso como erro — ver comentário em cancelarAssinatura

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 3);

    expect(resultado).toBe("cancelado");
    expect(resolverCancelamentoPendente).toHaveBeenCalled();
  });

  it("12. retry posterior (reconciliação) funciona: segunda tentativa com sucesso resolve a pendência", async () => {
    cancelarAssinatura.mockResolvedValue(undefined);

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 2);

    expect(resultado).toBe("cancelado");
    expect(resolverCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo");
  });

  it("13. erro permanente (404 — id inválido) marca failed já na primeira tentativa, sem esperar esgotar retries", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 404));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 0);

    expect(resultado).toBe("falhou_definitivamente");
    expect(registrarTentativaCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo", "failed", expect.any(String));
  });

  it("erro permanente (401 — autenticação inválida) também marca failed direto", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 401));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 0);

    expect(resultado).toBe("falhou_definitivamente");
  });

  it("erro transitório repetido esgota as tentativas (5ª tentativa) e vira failed — 'ação manual necessária'", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 500));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 4); // já teve 4 tentativas — esta é a 5ª

    expect(resultado).toBe("falhou_definitivamente");
    expect(registrarTentativaCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo", "failed", expect.any(String));
  });

  it("erro transitório na 4ª tentativa ainda não esgota (continua pending)", async () => {
    cancelarAssinatura.mockRejectedValue(new MercadoPagoApiError("Falha na comunicação com o Mercado Pago.", 500));

    const resultado = await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo", 3); // 4ª tentativa

    expect(resultado).toBe("pendente");
  });

  it("20. nenhum dado da assinatura antiga é perdido: mesmo depois de várias falhas, o preapprovalId sempre é passado pra persistência", async () => {
    cancelarAssinatura.mockRejectedValue(new Error("instável"));
    await cancelarComRecuperacao(ADMIN, ROTA, "empresa-1", "sub-antigo-especifico", 0);
    expect(registrarTentativaCancelamentoPendente.mock.calls[0][2]).toBe("sub-antigo-especifico");
  });
});

describe("reconciliarCancelamentoPendente — nunca confia só no estado local, reconsulta o Mercado Pago (08/2026)", () => {
  const PENDENCIA_PENDING: PendingPreapprovalCancellation = {
    preapprovalId: "sub-antigo",
    status: "pending",
    attempts: 2,
    lastAttemptAt: new Date().toISOString(),
    lastError: "erro anterior",
  };

  const PENDENCIA_FAILED: PendingPreapprovalCancellation = {
    ...PENDENCIA_PENDING,
    status: "failed",
    attempts: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registrarTentativaCancelamentoPendente.mockResolvedValue(undefined);
    resolverCancelamentoPendente.mockResolvedValue(undefined);
  });

  it("14. já está cancelado no Mercado Pago (resolvido por qualquer via) — resolve sem reenviar cancelamento", async () => {
    buscarAssinatura.mockResolvedValue({ status: "cancelled", externalReference: "empresa-1|GESTAO_MENSAL" });

    const resultado = await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-1", PENDENCIA_PENDING);

    expect(resultado).toBe("ja_cancelado");
    expect(resolverCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-1", "sub-antigo");
    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("ainda ativo (authorized) e entrada 'pending' — tenta cancelar de novo usando as tentativas já registradas", async () => {
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|GESTAO_MENSAL" });
    cancelarAssinatura.mockResolvedValue(undefined);

    const resultado = await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-1", PENDENCIA_PENDING);

    expect(cancelarAssinatura).toHaveBeenCalledWith("sub-antigo");
    expect(resultado).toBe("cancelado");
  });

  it("ainda ativo e entrada 'failed' (tentativas esgotadas) — NÃO martela o Mercado Pago de novo, só a checagem de estado roda", async () => {
    buscarAssinatura.mockResolvedValue({ status: "authorized", externalReference: "empresa-1|GESTAO_MENSAL" });

    const resultado = await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-1", PENDENCIA_FAILED);

    expect(resultado).toBe("falhou_definitivamente");
    expect(cancelarAssinatura).not.toHaveBeenCalled();
  });

  it("falha ao consultar o estado real (Mercado Pago fora do ar) — não decide nada agora, nunca perde a pendência", async () => {
    buscarAssinatura.mockRejectedValue(new Error("Mercado Pago fora do ar"));

    const resultado = await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-1", PENDENCIA_PENDING);

    expect(resultado).toBe("pendente");
    expect(cancelarAssinatura).not.toHaveBeenCalled();
    expect(resolverCancelamentoPendente).not.toHaveBeenCalled();
    expect(registrarTentativaCancelamentoPendente).not.toHaveBeenCalled(); // não reescreve o estado só porque a consulta falhou
  });

  it("17. company A não afeta company B: cada chamada opera só sobre o companyId/preapprovalId recebidos", async () => {
    buscarAssinatura.mockResolvedValue({ status: "cancelled", externalReference: "x" });

    await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-A", { ...PENDENCIA_PENDING, preapprovalId: "sub-a" });
    await reconciliarCancelamentoPendente(ADMIN, ROTA, "empresa-B", { ...PENDENCIA_PENDING, preapprovalId: "sub-b" });

    expect(resolverCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-A", "sub-a");
    expect(resolverCancelamentoPendente).toHaveBeenCalledWith(ADMIN, "empresa-B", "sub-b");
    expect(resolverCancelamentoPendente).toHaveBeenCalledTimes(2);
  });
});
