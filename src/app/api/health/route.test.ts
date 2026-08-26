import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const select = vi.fn();
const from = vi.fn(() => ({ select }));
const createAdminClient = vi.fn(() => ({ from }));
const captureError = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));
vi.mock("@/lib/observability/logger", () => ({ captureError: (...args: unknown[]) => captureError(...args) }));

function chamarHealth() {
  return async () => {
    const { GET } = await import("./route");
    return GET();
  };
}

describe("/api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("200 com status ok quando o banco responde sem erro (nunca chama Anthropic nem Z-API)", async () => {
    select.mockResolvedValue({ error: null });
    const resposta = await chamarHealth()();
    const data = await resposta.json();

    expect(resposta.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.database).toBe("ok");
    expect(data.service).toBe("frota-ia-assistente");
    expect(typeof data.timestamp).toBe("string");
    expect(captureError).not.toHaveBeenCalled();
  });

  it("503 com status degraded quando o banco falha, sem vazar detalhe do erro no corpo da resposta", async () => {
    select.mockResolvedValue({ error: { message: "connection refused", code: "ECONNREFUSED" } });
    const resposta = await chamarHealth()();
    const data = await resposta.json();

    expect(resposta.status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.database).toBe("erro");
    expect(JSON.stringify(data)).not.toContain("connection refused");
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("503 quando a consulta ao banco lança exceção (não só erro no retorno)", async () => {
    select.mockRejectedValue(new Error("timeout"));
    const resposta = await chamarHealth()();
    expect(resposta.status).toBe(503);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it("nunca retorna secrets no corpo da resposta", async () => {
    select.mockResolvedValue({ error: null });
    const resposta = await chamarHealth()();
    const texto = JSON.stringify(await resposta.json());
    expect(texto).not.toMatch(/SECRET|TOKEN|API_KEY/i);
  });
});
