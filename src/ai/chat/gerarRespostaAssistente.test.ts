import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ---- Anthropic client ----
const messagesCreate = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  createAnthropicClient: () => ({ messages: { create: (...a: unknown[]) => messagesCreate(...a) } }),
  CLAUDE_MODEL: "mock-model",
}));

// ---- Tool schemas (o que vira `tools` na chamada da Anthropic) ----
vi.mock("@/lib/anthropic/tools", () => ({
  construirFerramentasAnthropic: () => [
    { name: "analisar_frete", description: "d", input_schema: { type: "object", properties: {} } },
    { name: "consultar_rota", description: "d", input_schema: { type: "object", properties: {} } },
  ],
  construirFerramentaBuscaOficial: () => ({ type: "web_search_20260209", name: "web_search", allowed_domains: [] }),
  construirFerramentaLeituraOficial: () => ({ type: "web_fetch_20260209", name: "web_fetch", allowed_domains: [] }),
  construirFerramentaBuscaAmpla: () => ({ type: "web_search_20260209", name: "web_search" }),
  construirFerramentaLeituraAmpla: () => ({ type: "web_fetch_20260209", name: "web_fetch" }),
  CAMPOS_DE_CONTEXTO_RESERVADOS: new Set(["userId", "companyId", "conversationId", "sourceMessageId"]),
}));

vi.mock("@/lib/anthropic/systemPrompt", () => ({ construirSystemPrompt: () => "system prompt fixo" }));

// ---- Persistência (mockada como passthrough — não é o que este teste cobre) ----
const appendMessage = vi.fn();
const listMessages = vi.fn();
vi.mock("@/services/supabase/conversationService", () => ({
  appendMessage: (...a: unknown[]) => appendMessage(...a),
  listMessages: (...a: unknown[]) => listMessages(...a),
}));

vi.mock("@/services/supabase/analysisHistoryService", () => ({
  startAnalysisRun: vi.fn().mockResolvedValue({ id: "run-1" }),
  completeAnalysisRun: vi.fn().mockResolvedValue(undefined),
  failAnalysisRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/ai/context/customerContext", () => ({
  // Passthrough: só executa a ferramenta, ignora a gravação em tool_executions (fora do escopo deste teste).
  saveToolExecution: async (_client: unknown, _companyId: unknown, _params: unknown, executar: () => unknown) => executar(),
}));

const executarAnalisarFrete = vi.fn().mockResolvedValue({ sucesso: true, mensagemResumo: "frete ok" });
const executarConsultarRota = vi.fn().mockResolvedValue({ sucesso: true, mensagemResumo: "rota ok" });
vi.mock("@/ai/tools", () => ({
  FERRAMENTAS_FROTA_IA: [
    { nome: "analisar_frete", executar: (...a: unknown[]) => executarAnalisarFrete(...a) },
    { nome: "consultar_rota", executar: (...a: unknown[]) => executarConsultarRota(...a) },
  ],
}));

function respostaTextoFinal(texto: string) {
  return { content: [{ type: "text", text: texto }], stop_reason: "end_turn" as const };
}

function respostaToolUse(nome: string) {
  return {
    content: [{ type: "tool_use", id: "tu-1", name: nome, input: {} }],
    stop_reason: "tool_use" as const,
  };
}

const CUSTOMER_CONTEXT = { company: null, memories: [], activeRadars: [], preferences: null } as never;
const VEHICLE_CONTEXT = { vehicle: null, costProfile: null, tireProfiles: [] } as never;
const CONVERSATION = { id: "conv-1", title: "algo" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  appendMessage.mockResolvedValue({ id: "msg-in", created_at: "2026-09-11T00:00:00Z" });
  listMessages.mockResolvedValue([]);
});

describe("gerarRespostaAssistente — ferramentasPermitidas (inversão do funil, 09/2026)", () => {
  it("sem ferramentasPermitidas, manda as 2 ferramentas completas pra Anthropic (comportamento de sempre)", async () => {
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("oi"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "oi",
    });

    const toolsEnviadas = messagesCreate.mock.calls[0][0].tools.map((t: { name: string }) => t.name);
    expect(toolsEnviadas).toEqual(expect.arrayContaining(["analisar_frete", "consultar_rota"]));
  });

  it("com ferramentasPermitidas, filtra as ferramentas próprias — só a(s) liberada(s) chega(m) na Anthropic", async () => {
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("oi"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "quero calcular um frete",
      ferramentasPermitidas: ["analisar_frete"],
    });

    const toolsEnviadas = messagesCreate.mock.calls[0][0].tools.map((t: { name: string }) => t.name);
    expect(toolsEnviadas).toContain("analisar_frete");
    expect(toolsEnviadas).not.toContain("consultar_rota");
  });

  it("ferramenta restrita continua fora da lista mesmo se o histórico/prompt tentar mencioná-la (busca oficial nunca é restringida)", async () => {
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("oi"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "oi",
      ferramentasPermitidas: ["consultar_rota"],
    });

    const nomesFerramentas = messagesCreate.mock.calls[0][0].tools.map((t: { name: string }) => t.name);
    expect(nomesFerramentas).toContain("web_search");
    expect(nomesFerramentas).toContain("web_fetch");
  });
});

describe("gerarRespostaAssistente — ferramentasExecutadas no retorno", () => {
  it("devolve o nome de cada ferramenta executada com sucesso na rodada", async () => {
    messagesCreate.mockResolvedValueOnce(respostaToolUse("analisar_frete"));
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("esse frete compensa"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    const resposta = await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "Curitiba pra São Paulo por R$4200, compensa?",
      ferramentasPermitidas: ["analisar_frete"],
      modoDemo: true,
    });

    expect(resposta.ferramentasExecutadas).toEqual(["analisar_frete"]);
    expect(resposta.message.content).toBe("esse frete compensa");
  });

  it("sem nenhuma ferramenta chamada na rodada, devolve array vazio", async () => {
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("me conta mais sobre o frete"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    const resposta = await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "quero analisar um frete",
      ferramentasPermitidas: ["analisar_frete"],
      modoDemo: true,
    });

    expect(resposta.ferramentasExecutadas).toEqual([]);
  });

  it("ferramenta que falha (sucesso: false) NÃO entra em ferramentasExecutadas", async () => {
    executarConsultarRota.mockResolvedValueOnce({ sucesso: false, mensagemResumo: "endereço não encontrado" });
    messagesCreate.mockResolvedValueOnce(respostaToolUse("consultar_rota"));
    messagesCreate.mockResolvedValueOnce(respostaTextoFinal("não consegui achar o endereço"));
    const { gerarRespostaAssistente } = await import("./gerarRespostaAssistente");

    const resposta = await gerarRespostaAssistente({
      client: {} as never,
      userId: "user-1",
      companyId: "empresa-1",
      conversation: CONVERSATION,
      customerContext: CUSTOMER_CONTEXT,
      vehicleContext: VEHICLE_CONTEXT,
      mensagemUsuario: "rota de X pra Y",
      ferramentasPermitidas: ["consultar_rota"],
      modoDemo: true,
    });

    expect(resposta.ferramentasExecutadas).toEqual([]);
  });
});
