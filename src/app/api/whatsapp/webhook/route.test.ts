import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guia de Primeiros Passos V1 (08/2026) — cobertura de integração do
 * dispatch dentro do webhook do WhatsApp (a rota nunca teve teste
 * dedicado antes desta rodada; a lógica do onboarding em si, checklist,
 * grupo etc. já é coberta nos módulos que ela chama). Escopo aqui: só o
 * comportamento do GUIA (oferta, controles, comando permanente, nudge) —
 * não uma suíte completa de toda a rota.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/whatsapp/config", () => ({
  isWhatsappConfigured: () => true,
  getWhatsappConfig: () => ({ WHATSAPP_WEBHOOK_SECRET: "segredo" }),
}));

const sendWhatsappText = vi.fn();
const sendWhatsappOptionList = vi.fn();
const sendWhatsappButtons = vi.fn();
vi.mock("@/lib/whatsapp/zapiClient", () => ({
  sendWhatsappText: (...a: unknown[]) => sendWhatsappText(...a),
  sendWhatsappOptionList: (...a: unknown[]) => sendWhatsappOptionList(...a),
  sendWhatsappButtons: (...a: unknown[]) => sendWhatsappButtons(...a),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const resolveOrCreateUserByPhone = vi.fn();
vi.mock("@/services/supabase/userIdentityService", () => ({
  resolveOrCreateUserByPhone: (...a: unknown[]) => resolveOrCreateUserByPhone(...a),
}));

const getOnboardingSession = vi.fn();
const createOnboardingSession = vi.fn();
const updateOnboardingSession = vi.fn();
vi.mock("@/services/supabase/onboardingSessionService", () => ({
  getOnboardingSession: (...a: unknown[]) => getOnboardingSession(...a),
  createOnboardingSession: (...a: unknown[]) => createOnboardingSession(...a),
  updateOnboardingSession: (...a: unknown[]) => updateOnboardingSession(...a),
}));

const finalizeOnboarding = vi.fn();
vi.mock("@/ai/whatsapp/finalizeOnboarding", () => ({ finalizeOnboarding: (...a: unknown[]) => finalizeOnboarding(...a) }));

const processOnboardingMessage = vi.fn();
vi.mock("@/ai/whatsapp/onboardingConversation", async () => {
  const actual = await vi.importActual<typeof import("@/ai/whatsapp/onboardingConversation")>("@/ai/whatsapp/onboardingConversation");
  return { ...actual, processOnboardingMessage: (...a: unknown[]) => processOnboardingMessage(...a) };
});

const loadCustomerContext = vi.fn();
const loadVehicleContext = vi.fn();
vi.mock("@/ai/context/customerContext", () => ({
  loadCustomerContext: (...a: unknown[]) => loadCustomerContext(...a),
  loadVehicleContext: (...a: unknown[]) => loadVehicleContext(...a),
}));

const getOrCreateOpenConversation = vi.fn();
const appendMessage = vi.fn();
vi.mock("@/services/supabase/conversationService", () => ({
  getOrCreateOpenConversation: (...a: unknown[]) => getOrCreateOpenConversation(...a),
  appendMessage: (...a: unknown[]) => appendMessage(...a),
}));

const gerarRespostaAssistente = vi.fn();
vi.mock("@/ai/chat/gerarRespostaAssistente", () => ({ gerarRespostaAssistente: (...a: unknown[]) => gerarRespostaAssistente(...a) }));

const getSubscription = vi.fn();
vi.mock("@/services/supabase/subscriptionService", async () => {
  const actual = await vi.importActual<typeof import("@/services/supabase/subscriptionService")>("@/services/supabase/subscriptionService");
  return { ...actual, getSubscription: (...a: unknown[]) => getSubscription(...a) };
});

const findPendingChecklistDispatchByPhone = vi.fn();
vi.mock("@/services/supabase/checklistDispatchService", () => ({
  findPendingChecklistDispatchByPhone: (...a: unknown[]) => findPendingChecklistDispatchByPhone(...a),
  recordChecklistResponse: vi.fn(),
}));

vi.mock("@/services/freight/groupMessageIntake", () => ({ processarMensagemDeGrupo: vi.fn().mockResolvedValue(undefined) }));

const getGuideState = vi.fn();
const saveGuideState = vi.fn();
const markGuideOffered = vi.fn();
vi.mock("@/services/supabase/companyPreferencesService", () => ({
  getGuideState: (...a: unknown[]) => getGuideState(...a),
  saveGuideState: (...a: unknown[]) => saveGuideState(...a),
  markGuideOffered: (...a: unknown[]) => markGuideOffered(...a),
}));

const logEvent = vi.fn();
const captureError = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logEvent: (...a: unknown[]) => logEvent(...a),
  captureError: (...a: unknown[]) => captureError(...a),
}));

const EMPRESA = "empresa-1";
const USER_ID = "user-1";

function chamarWebhook(body: Record<string, unknown>) {
  return async () => {
    const { POST } = await import("./route");
    return POST(new Request("https://app.example.com/api/whatsapp/webhook?token=segredo", { method: "POST", body: JSON.stringify(body) }));
  };
}

function mensagemTexto(texto: string, overrides: Record<string, unknown> = {}) {
  return { phone: "+5541999998888", messageId: `msg-${Math.random()}`, text: { message: texto }, ...overrides };
}

function mensagemLista(selectedRowId: string) {
  return { phone: "+5541999998888", messageId: `msg-${Math.random()}`, listResponseMessage: { selectedRowId } };
}

describe("Guia de Primeiros Passos V1 — dispatch no webhook do WhatsApp (08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "completed", collected_data: {} });
    loadCustomerContext.mockResolvedValue({ company: { id: EMPRESA }, memories: [], role: "owner", preferences: {}, activeRadars: [] });
    loadVehicleContext.mockResolvedValue({ vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null });
    getOrCreateOpenConversation.mockResolvedValue({ id: "conv-1" });
    appendMessage.mockResolvedValue(undefined);
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-1", content: "resposta real da IA" } });
    getSubscription.mockResolvedValue({ status: "ATIVA", valido_ate: null, fleet_panel_included: false });
    findPendingChecklistDispatchByPhone.mockResolvedValue(null);
    saveGuideState.mockResolvedValue(undefined);
    markGuideOffered.mockResolvedValue(undefined);
    sendWhatsappText.mockResolvedValue(undefined);
    sendWhatsappOptionList.mockResolvedValue(undefined);
    sendWhatsappButtons.mockResolvedValue(undefined);
    processOnboardingMessage.mockReturnValue({
      nextState: "awaiting_name",
      collectedData: {},
      finalize: false,
      reply: { kind: "text", text: "ok" },
    });
  });

  it("1. cliente novo (sem acesso ainda) — guia NÃO aparece: nunca consulta guide state", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: true });
    await chamarWebhook(mensagemTexto("oi"))();
    expect(getGuideState).not.toHaveBeenCalled();
  });

  it("2. onboarding incompleto — guia NÃO aparece: retorna antes de chegar no dispatch do guia", async () => {
    getOnboardingSession.mockResolvedValue({ state: "awaiting_name", collected_data: {} });
    await chamarWebhook(mensagemTexto("Rafael"))();
    expect(getGuideState).not.toHaveBeenCalled();
  });

  it("3. onboarding concluído (trial/liberação válida) — guia É consultado no fluxo pós-onboarding", async () => {
    getGuideState.mockResolvedValue({ status: "not_started", step: null, offeredAt: "2026-08-01T00:00:00.000Z" });
    await chamarWebhook(mensagemTexto("quanto gasto de combustível?"))();
    expect(getGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1");
  });

  it("4. 'Fazer agora' inicia o guia no passo 1 (veículo) e persiste in_progress", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: null, offeredAt: "x" });
    const resposta = await chamarWebhook(mensagemLista("guide_v1_start"))();

    expect(resposta.status).toBe(200);
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "in_progress", step: "veiculo" });
    expect(sendWhatsappOptionList).toHaveBeenCalled();
    expect(gerarRespostaAssistente).not.toHaveBeenCalled(); // controle reconhecido nunca gasta chamada de IA
  });

  it("5. 'Depois' mantém not_started, sem dispensar de vez", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: null, offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_later"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "not_started", step: null });
  });

  it("6. 'Não preciso' dispensa (dismissed)", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: null, offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_no_thanks"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "dismissed", step: null });
  });

  it("7. avançar etapa: passo salvo 'frete' + Próximo → avança pra 'custos'", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "frete", offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_next"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "in_progress", step: "custos" });
  });

  it("8. pular (sinônimo digitado de avançar) tem o mesmo efeito do botão Próximo", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "veiculo", offeredAt: "x" });
    await chamarWebhook(mensagemTexto("pular"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "in_progress", step: "frete" });
  });

  it("9. sair do guia: dismissed, mas preserva o passo salvo (permite retomar)", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "custos", offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_exit"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "dismissed", step: "custos" });
  });

  it("10. retomar: comando manual depois de sair oferece continuar de onde parou", async () => {
    getGuideState.mockResolvedValue({ status: "dismissed", step: "custos", offeredAt: "x" });
    await chamarWebhook(mensagemTexto("primeiros passos"))();
    expect(sendWhatsappOptionList).toHaveBeenCalledWith(
      "+5541999998888",
      expect.stringContaining("passo 3"),
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ id: "guide_v1_resume" })])
    );
    expect(saveGuideState).not.toHaveBeenCalled(); // só pergunta — a transição real só acontece na próxima resposta do cliente
  });

  it("10b. resposta 'continuar' à retomada volta pro passo salvo, não pro início", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "radar", offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_resume"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "in_progress", step: "radar" });
  });

  it("11. concluir: avançar a partir do último passo de conteúdo (radar) marca completed", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "radar", offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_next"))();
    expect(saveGuideState).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1", { status: "completed", step: null });
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("essencial"));
  });

  it("12. reiniciar manualmente: comando depois de completed oferece 'fazer de novo'", async () => {
    getGuideState.mockResolvedValue({ status: "completed", step: null, offeredAt: "x" });
    await chamarWebhook(mensagemTexto("tutorial"))();
    expect(sendWhatsappOptionList).toHaveBeenCalledWith(
      "+5541999998888",
      expect.stringContaining("de novo"),
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ id: "guide_v1_start" })])
    );
  });

  it("13/14. pergunta paralela à IA durante o guia: responde de verdade E lembra o passo, sem perder o progresso", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "custos", offeredAt: "x" });
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-2", content: "CPK é o custo por quilômetro rodado." } });

    await chamarWebhook(mensagemTexto("como funciona CPK?"))();

    expect(gerarRespostaAssistente).toHaveBeenCalledWith(expect.objectContaining({ mensagemUsuario: "como funciona CPK?" }));
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", "CPK é o custo por quilômetro rodado.");
    expect(sendWhatsappOptionList).toHaveBeenCalledWith(
      "+5541999998888",
      expect.stringContaining("passo 3"),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(saveGuideState).not.toHaveBeenCalled(); // nunca perde/altera o passo por causa de uma pergunta paralela
  });

  it("15. análise de frete real durante o guia (passo 'frete'): a IA de verdade roda, não um exemplo fake", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "frete", offeredAt: "x" });
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-3", content: "Esse frete compensa: margem de 18%." } });

    await chamarWebhook(mensagemTexto("Curitiba para São Paulo por R$ 5.200, compensa?"))();

    expect(gerarRespostaAssistente).toHaveBeenCalledWith(expect.objectContaining({ mensagemUsuario: "Curitiba para São Paulo por R$ 5.200, compensa?" }));
  });

  it("16. registro real durante o guia (passo 'registro'): a ferramenta real roda pela IA", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "registro", offeredAt: "x" });
    await chamarWebhook(mensagemTexto("Registre R$ 850 de manutenção no Scania."))();
    expect(gerarRespostaAssistente).toHaveBeenCalledWith(expect.objectContaining({ mensagemUsuario: "Registre R$ 850 de manutenção no Scania." }));
  });

  it("17. cliente existente não perde dados: nenhuma chamada de onboarding é feita fora do fluxo do guia", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "veiculo", offeredAt: "x" });
    await chamarWebhook(mensagemLista("guide_v1_next"))();
    expect(finalizeOnboarding).not.toHaveBeenCalled();
    expect(updateOnboardingSession).not.toHaveBeenCalled();
  });

  it("18. nenhuma tool fica bloqueada pelo guia: assinatura vencida continua bloqueando pergunta real mesmo com guia em andamento", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "custos", offeredAt: "x" });
    getSubscription.mockResolvedValue({ status: "EXPIRADA", valido_ate: "2020-01-01T00:00:00.000Z", fleet_panel_included: false });

    await chamarWebhook(mensagemTexto("quanto gasto de combustível esse mês?"))();

    expect(gerarRespostaAssistente).not.toHaveBeenCalled();
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("teste gratuito"));
  });

  it("19. guia em andamento não intercepta mensagens comuns não reconhecidas como controle — cai pro fluxo normal (help/funcionalidades continuam funcionando)", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "veiculo", offeredAt: "x" });
    await chamarWebhook(mensagemTexto("ajuda"))();
    expect(sendWhatsappOptionList).toHaveBeenCalled(); // reabre o menu de sugestões, não o guia
  });

  it("20. comando de guia nunca dispara quando o guia já está em andamento (evita duplo aviso) — trata como controle normal se casar, senão cai no fluxo do passo atual", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "veiculo", offeredAt: "x" });
    await chamarWebhook(mensagemTexto("tutorial"))();
    // "tutorial" não é um controle reconhecido (não é next/exit/etc) — vira pergunta livre pra IA, com lembrete depois
    expect(gerarRespostaAssistente).toHaveBeenCalled();
  });

  it("oferta do guia é enviada só 1x, no fechamento do onboarding — nunca reenviada se guide_v1_offered_at já existir", async () => {
    getOnboardingSession.mockResolvedValue({ state: "awaiting_consumption", collected_data: { name: "Rafael" } });
    processOnboardingMessage.mockReturnValue({
      nextState: "completed",
      collectedData: { name: "Rafael" },
      finalize: true,
      reply: { kind: "text", text: "ok" },
    });
    finalizeOnboarding.mockResolvedValue({ id: EMPRESA });
    getGuideState.mockResolvedValue({ status: "not_started", step: null, offeredAt: null });

    await chamarWebhook(mensagemTexto("2.8"))();

    expect(markGuideOffered).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1");
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "guide_v1_offered" }));
  });

  it("oferta nunca é reenviada quando guide_v1_offered_at já está preenchido", async () => {
    getOnboardingSession.mockResolvedValue({ state: "awaiting_consumption", collected_data: { name: "Rafael" } });
    processOnboardingMessage.mockReturnValue({
      nextState: "completed",
      collectedData: { name: "Rafael" },
      finalize: true,
      reply: { kind: "text", text: "ok" },
    });
    finalizeOnboarding.mockResolvedValue({ id: EMPRESA });
    getGuideState.mockResolvedValue({ status: "not_started", step: null, offeredAt: "2026-08-01T00:00:00.000Z" });

    await chamarWebhook(mensagemTexto("2.8"))();

    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("falha ao consultar/oferecer o guia nunca bloqueia a finalização do onboarding (best-effort)", async () => {
    getOnboardingSession.mockResolvedValue({ state: "awaiting_consumption", collected_data: { name: "Rafael" } });
    processOnboardingMessage.mockReturnValue({
      nextState: "completed",
      collectedData: { name: "Rafael" },
      finalize: true,
      reply: { kind: "text", text: "ok" },
    });
    finalizeOnboarding.mockResolvedValue({ id: EMPRESA });
    getGuideState.mockRejectedValue(new Error("Supabase fora do ar"));

    const resposta = await chamarWebhook(mensagemTexto("2.8"))();

    expect(resposta.status).toBe(200);
  });
});
