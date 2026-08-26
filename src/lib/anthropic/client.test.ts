import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

describe("createAnthropicClient (prontidão de produção — timeout explícito)", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-teste";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.resetModules();
  });

  it("lança AnthropicConfigError quando a chave não está configurada, sem cair no timeout padrão do SDK (10min)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { createAnthropicClient, AnthropicConfigError } = await import("./client");
    expect(() => createAnthropicClient()).toThrow(AnthropicConfigError);
  });

  it("configura um timeout explícito bem menor que o padrão de 10min do SDK — webhook não pode ficar pendurado por minutos esperando a Claude", async () => {
    const { createAnthropicClient } = await import("./client");
    const client = createAnthropicClient();
    // Timeout é interno ao client do SDK — checa que não ficou no padrão de 10min (600000ms).
    expect(client.timeout).toBeLessThan(600_000);
    expect(client.timeout).toBeGreaterThan(0);
  });
});
