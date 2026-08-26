import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SubscriptionRow } from "@/lib/supabase/tables";

const listarAssinaturasComCancelamentoPendente = vi.fn();
const reconciliarCancelamentoPendente = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/services/supabase/subscriptionService", () => ({
  listarAssinaturasComCancelamentoPendente: (...args: unknown[]) => listarAssinaturasComCancelamentoPendente(...args),
}));
vi.mock("@/services/mercadopago/cancelamentoAssinaturaAnterior", () => ({
  reconciliarCancelamentoPendente: (...args: unknown[]) => reconciliarCancelamentoPendente(...args),
}));

const SECRET = "segredo-de-teste";

function fakeAssinatura(companyId: string, pendencias: unknown[]): SubscriptionRow {
  return { company_id: companyId, pending_preapproval_cancellations: pendencias } as unknown as SubscriptionRow;
}

async function chamarRota(query = `?token=${SECRET}`) {
  const { GET } = await import("./route");
  return GET(new Request(`https://app.example.com/api/payments/mercadopago/reconcile-cancellations${query}`));
}

describe("GET /api/payments/mercadopago/reconcile-cancellations — fechamento final do risco residual (08/2026)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUBSCRIPTION_CANCEL_RECONCILE_SECRET = SECRET;
    listarAssinaturasComCancelamentoPendente.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("503 quando SUBSCRIPTION_CANCEL_RECONCILE_SECRET não está configurado", async () => {
    delete process.env.SUBSCRIPTION_CANCEL_RECONCILE_SECRET;
    const resposta = await chamarRota();
    expect(resposta.status).toBe(503);
  });

  it("401 com token errado", async () => {
    const resposta = await chamarRota("?token=errado");
    expect(resposta.status).toBe(401);
    expect(listarAssinaturasComCancelamentoPendente).not.toHaveBeenCalled();
  });

  it("nenhuma pendência: 200 sem processar nada", async () => {
    const resposta = await chamarRota();
    const corpo = await resposta.json();
    expect(corpo).toEqual({ ok: true, empresas: 0, processados: 0, sucesso: 0, falha: 0 });
  });

  it("17. company A não afeta company B: cada pendência é reconciliada isoladamente, com o companyId correto", async () => {
    listarAssinaturasComCancelamentoPendente.mockResolvedValue([
      fakeAssinatura("empresa-A", [{ preapprovalId: "sub-a", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null }]),
      fakeAssinatura("empresa-B", [{ preapprovalId: "sub-b", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null }]),
    ]);
    reconciliarCancelamentoPendente.mockResolvedValue("cancelado");

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(reconciliarCancelamentoPendente).toHaveBeenCalledWith(expect.anything(), expect.any(String), "empresa-A", expect.objectContaining({ preapprovalId: "sub-a" }));
    expect(reconciliarCancelamentoPendente).toHaveBeenCalledWith(expect.anything(), expect.any(String), "empresa-B", expect.objectContaining({ preapprovalId: "sub-b" }));
    expect(corpo).toEqual({ ok: true, empresas: 2, processados: 2, sucesso: 2, falha: 0 });
  });

  it("uma empresa com duas pendências (upgrades sucessivos antes da reconciliação anterior resolver) processa as duas", async () => {
    listarAssinaturasComCancelamentoPendente.mockResolvedValue([
      fakeAssinatura("empresa-1", [
        { preapprovalId: "sub-1", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null },
        { preapprovalId: "sub-2", status: "failed", attempts: 5, lastAttemptAt: "x", lastError: "erro" },
      ]),
    ]);
    reconciliarCancelamentoPendente.mockResolvedValueOnce("cancelado").mockResolvedValueOnce("falhou_definitivamente");

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(reconciliarCancelamentoPendente).toHaveBeenCalledTimes(2);
    expect(corpo).toEqual({ ok: true, empresas: 1, processados: 2, sucesso: 1, falha: 0 }); // "falhou_definitivamente" não é erro da rota — é um resultado válido e já registrado, só não conta como "sucesso"
  });

  it("erro inesperado ao reconciliar uma pendência não derruba o job nem impede as demais de serem processadas", async () => {
    listarAssinaturasComCancelamentoPendente.mockResolvedValue([
      fakeAssinatura("empresa-1", [{ preapprovalId: "sub-1", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null }]),
      fakeAssinatura("empresa-2", [{ preapprovalId: "sub-2", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null }]),
    ]);
    reconciliarCancelamentoPendente.mockRejectedValueOnce(new Error("Supabase fora do ar")).mockResolvedValueOnce("cancelado");

    const resposta = await chamarRota();
    const corpo = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(corpo).toEqual({ ok: true, empresas: 2, processados: 2, sucesso: 1, falha: 1 });
  });

  it("idempotente: rodar 2x seguidas não quebra nem duplica nada (cada chamada só reflete o estado atual do banco)", async () => {
    listarAssinaturasComCancelamentoPendente.mockResolvedValue([
      fakeAssinatura("empresa-1", [{ preapprovalId: "sub-1", status: "pending", attempts: 1, lastAttemptAt: "x", lastError: null }]),
    ]);
    reconciliarCancelamentoPendente.mockResolvedValue("cancelado");

    const resposta1 = await chamarRota();
    const resposta2 = await chamarRota();

    expect(resposta1.status).toBe(200);
    expect(resposta2.status).toBe(200);
    expect(reconciliarCancelamentoPendente).toHaveBeenCalledTimes(2); // uma vez por execução — cada execução é independente e segura
  });
});
