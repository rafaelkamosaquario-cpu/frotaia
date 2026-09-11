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
  getWhatsappConfig: () => ({ WHATSAPP_WEBHOOK_SECRET: "segredo", APP_URL: "https://frotaia.up.railway.app" }),
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
const criarEmpresaMinima = vi.fn();
vi.mock("@/ai/whatsapp/finalizeOnboarding", () => ({
  finalizeOnboarding: (...a: unknown[]) => finalizeOnboarding(...a),
  criarEmpresaMinima: (...a: unknown[]) => criarEmpresaMinima(...a),
}));

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
    criarEmpresaMinima.mockResolvedValue({ id: EMPRESA });
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

describe("Guia V1 — oferta automática exige isAccessAllowed (validação 08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    criarEmpresaMinima.mockResolvedValue({ id: EMPRESA });
    loadCustomerContext.mockResolvedValue({ company: { id: EMPRESA }, memories: [], role: "owner", preferences: {}, activeRadars: [] });
    loadVehicleContext.mockResolvedValue({ vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null });
    getOrCreateOpenConversation.mockResolvedValue({ id: "conv-1" });
    appendMessage.mockResolvedValue(undefined);
    sendWhatsappText.mockResolvedValue(undefined);
    sendWhatsappOptionList.mockResolvedValue(undefined);
    saveGuideState.mockResolvedValue(undefined);
    markGuideOffered.mockResolvedValue(undefined);
    getGuideState.mockResolvedValue({ status: "not_started", step: null, offeredAt: null });
    finalizeOnboarding.mockResolvedValue({ id: EMPRESA });
  });

  function finalizarOnboarding() {
    getOnboardingSession.mockResolvedValue({ state: "awaiting_consumption", collected_data: { name: "Rafael" } });
    processOnboardingMessage.mockReturnValue({
      nextState: "completed",
      collectedData: { name: "Rafael" },
      finalize: true,
      reply: { kind: "text", text: "ok" },
    });
    return chamarWebhook(mensagemTexto("2.8"))();
  }

  const FUTURO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const PASSADO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it("1. cliente novo com trial válido — guia oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "TRIAL", valido_ate: FUTURO, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).toHaveBeenCalledWith(expect.anything(), EMPRESA, "v1");
  });

  it("2. cliente pago (assinatura ATIVA recorrente) — guia oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "ATIVA", valido_ate: null, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).toHaveBeenCalled();
  });

  it("4. cliente sem assinatura nenhuma (null) — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue(null);
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
    expect(sendWhatsappOptionList).not.toHaveBeenCalledWith("+5541999998888", expect.stringContaining("guia rápido"), expect.anything(), expect.anything(), expect.anything());
  });

  it("5. trial expirado (valido_ate no passado) — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "TRIAL", valido_ate: PASSADO, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("6. telefone já usou trial antes (criarAssinaturaTeste grava EXPIRADA na hora) — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "EXPIRADA", valido_ate: PASSADO, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("7. assinatura CANCELADA — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "CANCELADA", valido_ate: null, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("8. assinatura EXPIRADA — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "EXPIRADA", valido_ate: null, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("9. assinatura INADIMPLENTE — guia NÃO oferecido", async () => {
    getSubscription.mockResolvedValue({ status: "INADIMPLENTE", valido_ate: null, fleet_panel_included: false });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("10. guia já dispensado (offeredAt já preenchido) — nunca reoferece, mesmo com acesso válido", async () => {
    getSubscription.mockResolvedValue({ status: "ATIVA", valido_ate: null, fleet_panel_included: false });
    getGuideState.mockResolvedValue({ status: "dismissed", step: null, offeredAt: "2026-08-01T00:00:00.000Z" });
    await finalizarOnboarding();
    expect(markGuideOffered).not.toHaveBeenCalled();
  });

  it("sem acesso válido: cadastro conclui normalmente mesmo assim (o guia é o único bloqueado, nunca o onboarding)", async () => {
    getSubscription.mockResolvedValue(null);
    const resposta = await finalizarOnboarding();
    expect(resposta.status).toBe(200);
    expect(finalizeOnboarding).toHaveBeenCalled();
  });
});

describe("Guia V1 — interação manual/em andamento também exige isAccessAllowed (validação 08/2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    criarEmpresaMinima.mockResolvedValue({ id: EMPRESA });
    getOnboardingSession.mockResolvedValue({ state: "completed", collected_data: {} });
    loadCustomerContext.mockResolvedValue({ company: { id: EMPRESA }, memories: [], role: "owner", preferences: {}, activeRadars: [] });
    loadVehicleContext.mockResolvedValue({ vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null });
    getOrCreateOpenConversation.mockResolvedValue({ id: "conv-1" });
    appendMessage.mockResolvedValue(undefined);
    sendWhatsappText.mockResolvedValue(undefined);
    sendWhatsappOptionList.mockResolvedValue(undefined);
    saveGuideState.mockResolvedValue(undefined);
    findPendingChecklistDispatchByPhone.mockResolvedValue(null);
  });

  it("guia em andamento + assinatura vencida: 'Próximo' NÃO avança o passo (sem acesso, o toque não tem efeito nenhum no guia)", async () => {
    getGuideState.mockResolvedValue({ status: "in_progress", step: "veiculo", offeredAt: "x" });
    getSubscription.mockResolvedValue({ status: "EXPIRADA", valido_ate: null, fleet_panel_included: false });

    const resposta = await chamarWebhook(mensagemLista("guide_v1_next"))();

    expect(resposta.status).toBe(200);
    expect(saveGuideState).not.toHaveBeenCalled();
    expect(gerarRespostaAssistente).not.toHaveBeenCalled();
  });

  it("comando manual ('primeiros passos') + assinatura vencida: NÃO reabre o guia, cai no gate normal de assinatura", async () => {
    getGuideState.mockResolvedValue({ status: "dismissed", step: null, offeredAt: "x" });
    getSubscription.mockResolvedValue({ status: "CANCELADA", valido_ate: null, fleet_panel_included: false });

    await chamarWebhook(mensagemTexto("primeiros passos"))();

    expect(sendWhatsappOptionList).not.toHaveBeenCalledWith(
      "+5541999998888",
      expect.stringContaining("guia rápido"),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("teste gratuito"));
  });

  it("comando manual funciona normalmente quando o cliente TEM acesso válido (não regrediu)", async () => {
    getGuideState.mockResolvedValue({ status: "dismissed", step: null, offeredAt: "x" });
    getSubscription.mockResolvedValue({ status: "ATIVA", valido_ate: null, fleet_panel_included: false });

    await chamarWebhook(mensagemTexto("primeiros passos"))();

    expect(sendWhatsappOptionList).toHaveBeenCalled();
  });
});

function mensagemBotao(buttonId: string) {
  return { phone: "+5541999998888", messageId: `msg-${Math.random()}`, buttonsResponseMessage: { buttonId } };
}

describe("Inversão do funil (09/2026) — demo pré-cadastro antes das 11 perguntas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    criarEmpresaMinima.mockResolvedValue({ id: EMPRESA });
    loadCustomerContext.mockResolvedValue({ company: { id: EMPRESA }, memories: [], role: "owner", preferences: {}, activeRadars: [] });
    loadVehicleContext.mockResolvedValue({ vehicle: null, costProfile: null, tireProfiles: [], insuranceExpiryDate: null, licensingExpiryDate: null });
    getOrCreateOpenConversation.mockResolvedValue({ id: "conv-1" });
    appendMessage.mockResolvedValue(undefined);
    sendWhatsappText.mockResolvedValue(undefined);
    sendWhatsappOptionList.mockResolvedValue(undefined);
    sendWhatsappButtons.mockResolvedValue(undefined);
    getSubscription.mockResolvedValue({ status: "TRIAL", valido_ate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), fleet_panel_included: false });
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-1", content: "resposta da demo" }, ferramentasExecutadas: [] });
  });

  it("cliente novo (não Empresas): cria empresa mínima em silêncio e mostra o menu de demo, não as 11 perguntas", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: true });

    await chamarWebhook(mensagemTexto("Quero testar o Frota IA grátis"))();

    expect(criarEmpresaMinima).toHaveBeenCalledWith(expect.anything(), USER_ID, "+5541999998888");
    expect(updateOnboardingSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ state: "awaiting_demo_choice", collectedData: expect.objectContaining({ companyId: EMPRESA }) })
    );
    expect(sendWhatsappOptionList).toHaveBeenCalled();
    expect(sendWhatsappText).not.toHaveBeenCalledWith("+5541999998888", expect.stringContaining("Como posso chamar você"));
  });

  it("cliente novo vindo de um CTA de plano (landing): guarda ofertaPretendida junto da empresa mínima", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: true });

    await chamarWebhook(mensagemTexto("Quero assinar o Frota IA Individual por R$89,90/mês."))();

    expect(updateOnboardingSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ collectedData: expect.objectContaining({ companyId: EMPRESA, ofertaPretendida: "INDIVIDUAL_MENSAL" }) })
    );
  });

  it("lead 'Empresas': mantém o fluxo de sempre — sem demo, sem empresa mínima, direto pras 11 perguntas", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: true });

    await chamarWebhook(mensagemTexto("Quero conhecer o Frota IA Empresas para uma frota com mais de 10 veículos."))();

    expect(criarEmpresaMinima).not.toHaveBeenCalled();
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("atendimento comercial direto"));
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("Como posso chamar você"));
  });

  it("awaiting_demo_choice: tocar 'Analisar um frete' transiciona pra awaiting_demo_input com o track salvo", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_choice", collected_data: { companyId: EMPRESA } });

    await chamarWebhook(mensagemLista("frete"))();

    expect(updateOnboardingSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ state: "awaiting_demo_input", collectedData: expect.objectContaining({ companyId: EMPRESA, demoTrack: "frete" }) })
    );
    expect(gerarRespostaAssistente).not.toHaveBeenCalled(); // ainda não é hora da IA rodar, só a transição determinística
  });

  it("awaiting_demo_choice: 'Conhecer funções' mostra o catálogo completo e repete o menu, sem sair do estado", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_choice", collected_data: { companyId: EMPRESA } });

    await chamarWebhook(mensagemLista("funcionalidades"))();

    expect(sendWhatsappText).toHaveBeenCalled();
    expect(sendWhatsappOptionList).toHaveBeenCalled();
    expect(updateOnboardingSession).not.toHaveBeenCalledWith(expect.anything(), USER_ID, expect.objectContaining({ state: "awaiting_demo_input" }));
  });

  it("awaiting_demo_input: mensagem de texto vai pra IA com ferramentasPermitidas do track e modoDemo:true", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });

    await chamarWebhook(mensagemTexto("Curitiba pra São Paulo por R$4200, compensa?"))();

    expect(gerarRespostaAssistente).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: EMPRESA,
        mensagemUsuario: "Curitiba pra São Paulo por R$4200, compensa?",
        ferramentasPermitidas: expect.arrayContaining(["analisar_frete"]),
        modoDemo: true,
      })
    );
  });

  it("awaiting_demo_input: quando a ferramenta-alvo do track roda com sucesso, dispara o CTA pós-demo (botões)", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-2", content: "esse frete compensa" }, ferramentasExecutadas: ["analisar_frete"] });

    await chamarWebhook(mensagemTexto("Curitiba pra São Paulo por R$4200, compensa?"))();

    expect(sendWhatsappButtons).toHaveBeenCalledWith(
      "+5541999998888",
      expect.stringContaining("Gostou"),
      expect.arrayContaining([expect.objectContaining({ id: "demo_ver_planos" })])
    );
  });

  it("awaiting_demo_input: SEM a ferramenta-alvo executada (ex.: IA só pediu mais dado), não dispara o CTA ainda", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });
    gerarRespostaAssistente.mockResolvedValue({ message: { id: "m-2", content: "me conta o valor ofertado" }, ferramentasExecutadas: [] });

    await chamarWebhook(mensagemTexto("é um frete de Curitiba pra São Paulo"))();

    expect(sendWhatsappButtons).not.toHaveBeenCalled();
  });

  it("awaiting_demo_input: assinatura vencida bloqueia a demo com o mesmo aviso do fluxo pós-cadastro", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });
    getSubscription.mockResolvedValue({ status: "EXPIRADA", valido_ate: null, fleet_panel_included: false });

    await chamarWebhook(mensagemTexto("Curitiba pra São Paulo por R$4200"))();

    expect(gerarRespostaAssistente).not.toHaveBeenCalled();
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("teste gratuito"));
  });

  it("CTA 'Ver planos': mostra os 3 botões de plano e marca awaitingPlanChoice", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });

    await chamarWebhook(mensagemBotao("demo_ver_planos"))();

    expect(sendWhatsappButtons).toHaveBeenCalledWith(
      "+5541999998888",
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ id: "demo_plano_individual" }),
        expect.objectContaining({ id: "demo_plano_essencial" }),
        expect.objectContaining({ id: "demo_plano_pro" }),
      ])
    );
    expect(updateOnboardingSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ collectedData: expect.objectContaining({ awaitingPlanChoice: true }) })
    );
  });

  it("texto 'quero assinar' durante a demo também abre os botões de plano, sem precisar do CTA aparecer antes", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });

    await chamarWebhook(mensagemTexto("quero assinar"))();

    expect(sendWhatsappButtons).toHaveBeenCalled();
    expect(gerarRespostaAssistente).not.toHaveBeenCalled();
  });

  it("escolher um plano depois de 'Ver planos' gera o link de checkout de verdade", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({
      state: "awaiting_demo_input",
      collected_data: { companyId: EMPRESA, demoTrack: "frete", awaitingPlanChoice: true },
    });

    await chamarWebhook(mensagemBotao("demo_plano_essencial"))();

    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("/assinar?token="));
    expect(updateOnboardingSession).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      expect.objectContaining({ collectedData: expect.objectContaining({ awaitingPlanChoice: false }) })
    );
  });

  it("CTA 'Conhecer mais funções' volta pro menu de demo (awaiting_demo_choice)", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });

    await chamarWebhook(mensagemBotao("demo_conhecer_funcoes"))();

    expect(updateOnboardingSession).toHaveBeenCalledWith(expect.anything(), USER_ID, expect.objectContaining({ state: "awaiting_demo_choice" }));
    expect(sendWhatsappOptionList).toHaveBeenCalled();
  });

  it("CTA 'Agora não' só confirma e deixa continuar testando, sem mudar de estado", async () => {
    resolveOrCreateUserByPhone.mockResolvedValue({ userId: USER_ID, channelId: "canal-1", isNew: false });
    getOnboardingSession.mockResolvedValue({ state: "awaiting_demo_input", collected_data: { companyId: EMPRESA, demoTrack: "frete" } });

    await chamarWebhook(mensagemBotao("demo_agora_nao"))();

    expect(updateOnboardingSession).not.toHaveBeenCalled();
    expect(sendWhatsappText).toHaveBeenCalledWith("+5541999998888", expect.stringContaining("continuar testando"));
  });
});
