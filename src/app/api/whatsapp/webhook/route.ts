import { NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWhatsappConfig, isWhatsappConfigured } from "@/lib/whatsapp/config";
import { sendWhatsappText, sendWhatsappOptionList, sendWhatsappButtons } from "@/lib/whatsapp/zapiClient";
import { baixarMidia, paraBase64 } from "@/lib/whatsapp/mediaDownloader";
import { isWhisperConfigured } from "@/lib/openai/whisperConfig";
import { transcreverAudio } from "@/lib/openai/whisperClient";
import { planilhaParaTexto, MIME_TYPES_PLANILHA_SUPORTADOS, SpreadsheetParseError } from "@/lib/spreadsheet/spreadsheetParser";
import { ehPedidoDeAjuda, ehPedidoDeFuncionalidades, ehPedidoDeGuia, construirTextoAjudaCompleto } from "@/lib/helpMenu";
import { FROTA_SUGGESTIONS, SUGESTOES_LISTA_NATIVA_WHATSAPP, resolverSelecaoNumerada } from "@/lib/frotaSuggestions";
import { toPhoneE164 } from "@/lib/identity/phoneNormalizer";
import { resolveOrCreateUserByPhone } from "@/services/supabase/userIdentityService";
import { getOnboardingSession, createOnboardingSession, updateOnboardingSession } from "@/services/supabase/onboardingSessionService";
import { firstOnboardingMessage, processOnboardingMessage, type OnboardingCollectedData, type OnboardingReply } from "@/ai/whatsapp/onboardingConversation";
import { finalizeOnboarding } from "@/ai/whatsapp/finalizeOnboarding";
import { loadCustomerContext, loadVehicleContext } from "@/ai/context/customerContext";
import { getOrCreateOpenConversation, appendMessage } from "@/services/supabase/conversationService";
import { gerarRespostaAssistente } from "@/ai/chat/gerarRespostaAssistente";
import { getSubscription, isAccessAllowed } from "@/services/supabase/subscriptionService";
import { AnthropicConfigError } from "@/lib/anthropic/client";
import { isUniqueViolation } from "@/lib/supabase/errors";
import { findPendingChecklistDispatchByPhone, recordChecklistResponse } from "@/services/supabase/checklistDispatchService";
import { processarMensagemDeGrupo } from "@/services/freight/groupMessageIntake";
import { resolverIntencaoComercialLanding, mensagemConfirmacaoOferta, MENSAGEM_INTERESSE_EMPRESAS } from "@/lib/mercadopago/landingIntent";
import { buildCheckoutLinkUrl } from "@/services/whatsapp/checkoutLinkToken";
import { isOfertaPlano } from "@/lib/mercadopago/catalog";
import { captureError, logEvent } from "@/lib/observability/logger";
import { getGuideState, saveGuideState, markGuideOffered } from "@/services/supabase/companyPreferencesService";
import {
  buildGuideOfferV1,
  buildGuideReabrirV1,
  buildGuideRetomarNudgeV1,
  interpretarControleGuiaV1,
  processGuideControlV1,
  type GuideStepV1,
} from "@/ai/whatsapp/guideConversationV1";
import type { MessageInsert } from "@/lib/supabase/tables";

const ROTA = "/api/whatsapp/webhook";

/**
 * Webhook de mensagem recebida da instância Z-API própria do Frota IA
 * (separada da instância do ZapFlow — outro app deste repositório, sem
 * relação com este). Configurar no painel do Z-API, em "Webhook ao
 * receber": `${APP_URL}/api/whatsapp/webhook?token=<WHATSAPP_WEBHOOK_SECRET>`.
 * O token na query string é a validação de origem — a Z-API não assina o
 * corpo da requisição.
 *
 * Camada 6 (V1 centrada no WhatsApp) — fluxo por mensagem recebida:
 * 1. número desconhecido → cria o usuário na hora (WhatsApp é a porta de
 *    entrada, não exige painel/senha) e inicia o onboarding conversacional;
 * 2. onboarding em andamento → processa uma pergunta por vez via
 *    processOnboardingMessage, sem passar pela IA (só entende texto);
 * 3. onboarding concluído → mesma engine de chat da web
 *    (gerarRespostaAssistente). Imagem e PDF são enviados de verdade pra
 *    IA (Claude lê imagem/documento nativamente); áudio é transcrito antes
 *    de chegar no modelo; planilha (.xlsx/.csv) é convertida em texto (ver
 *    src/lib/spreadsheet/spreadsheetParser.ts) pelo mesmo motivo — o Claude
 *    não lê .xlsx nativamente. Outros tipos de documento ainda não são
 *    interpretados — ver limitações no docs/camada-6-whatsapp-v1.md (Fase F).
 */

interface ZApiWebhookBody {
  phone?: string;
  fromMe?: boolean;
  messageId?: string;
  senderName?: string;
  /** true para mensagem de grupo — nesse caso `phone` é o id do grupo (sufixo "-group"), não um telefone de pessoa. Campos confirmados na documentação oficial do Z-API, nunca presumidos. */
  isGroup?: boolean;
  /** Nome do grupo (só quando isGroup=true). */
  chatName?: string;
  /** Telefone de quem mandou a mensagem DENTRO do grupo (só quando isGroup=true) — nunca usado pra identidade de conta, só pra log/contexto do Radar de Fretes. */
  participantPhone?: string;
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string; mimeType?: string };
  document?: { documentUrl?: string; fileName?: string; mimeType?: string; caption?: string };
  audio?: { audioUrl?: string; mimeType?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contact?: { displayName?: string; vcard?: string };
  listResponseMessage?: { selectedRowId?: string; title?: string; message?: string };
  buttonsResponseMessage?: { buttonId?: string; message?: string };
}

const TIPOS_IMAGEM_SUPORTADOS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Envio pela Z-API é best-effort (nunca deve travar o processamento da
 * mensagem recebida por causa de uma falha de envio) — mas até 31/08/2026
 * essas falhas eram descartadas em silêncio (`.catch(() => {})`), sem log
 * nenhum. Foi assim que um `ZAPI_CLIENT_TOKEN` inválido em produção ficou
 * invisível: o cadastro avançava no banco normalmente, só a mensagem de
 * resposta nunca saía, e não havia nenhum jeito de ver isso nos logs.
 * `contexto` identifica de qual ponto do fluxo veio a falha (o texto da
 * mensagem em si nunca é logado, só o evento/telefone/erro).
 */
function logZapiSendFailure(error: unknown, phoneE164: string, contexto: string): void {
  captureError({ event: "whatsapp_envio_falhou", route: ROTA, phoneE164, contexto, error });
}

/**
 * Resolve a entrada do onboarding a partir do que o WhatsApp mandou: toque
 * numa lista (`listResponseMessage.selectedRowId`), toque num botão
 * (`buttonsResponseMessage.buttonId`) ou texto livre — nessa ordem de
 * prioridade, já que uma mesma mensagem nunca traz mais de um desses tipos.
 */
function resolverEntradaOnboarding(body: ZApiWebhookBody): string | undefined {
  return body.listResponseMessage?.selectedRowId ?? body.buttonsResponseMessage?.buttonId ?? body.text?.message?.trim();
}

/** Envia a `reply` estruturada do onboarding usando o método certo da Z-API conforme o `kind`. */
async function enviarRespostaOnboarding(phoneE164: string, reply: OnboardingReply): Promise<void> {
  if (reply.kind === "list") {
    await sendWhatsappOptionList(phoneE164, reply.text, reply.title, reply.buttonLabel, reply.options);
    return;
  }
  if (reply.kind === "buttons") {
    await sendWhatsappButtons(phoneE164, reply.text, reply.options);
    return;
  }
  await sendWhatsappText(phoneE164, reply.text);
}

const MENSAGEM_POS_CADASTRO =
  "Cadastro concluído!\n\nAgora você já pode conversar normalmente com o Frota IA.\n\nEscolha uma das opções abaixo para começar ou envie sua própria pergunta por texto, áudio, foto ou documento.";

/**
 * Personaliza a mensagem de conclusão citando a categoria que o cliente
 * escolheu na pergunta "o que você quer resolver primeiro" (ver
 * askIntent/onboardingConversation.ts, 07/08/2026) — reforça que o sistema
 * "lembrou" o que ele disse, em vez de cair só no texto genérico. Sem
 * intentId/intentLabel (sessão antiga que não passou por essa etapa), ou
 * quando o cliente escolheu "ver tudo" (já recebeu o catálogo completo
 * nessa etapa, mensagem genérica encaixa melhor), usa o texto padrão.
 */
function construirMensagemPosCadastro(intentId: unknown, intentLabel: unknown): string {
  if (intentId === "ver_tudo" || typeof intentLabel !== "string" || !intentLabel) return MENSAGEM_POS_CADASTRO;
  return `Cadastro concluído! Sobre ${intentLabel.toLowerCase()}, é só mandar quando quiser que eu já calculo.\n\nAqui embaixo tem outras coisas que também faço — ou envie sua própria pergunta por texto, áudio, foto ou documento.`;
}

const TEXTO_LISTA_SUGESTOES = "Como posso ajudar com sua frota hoje?";

/**
 * Enviado como mensagem separada logo após a lista — nunca dentro do corpo
 * dela (TEXTO_LISTA_SUGESTOES é um dos textos fixos da especificação,
 * nunca alterado). Reforça que nenhuma das opções é obrigatória: o
 * cliente sempre pode digitar a própria pergunta em vez de tocar numa
 * sugestão — já valia antes, só não ficava claro quando o menu era
 * reaberto por palavra-chave (esse caminho não passa por
 * MENSAGEM_POS_CADASTRO, que já tinha esse aviso).
 */
const LEMBRETE_PERGUNTA_LIVRE = "Se preferir, pode digitar sua própria pergunta a qualquer momento — não precisa escolher uma das opções acima.";

/**
 * Fallback em texto usa as 11 sugestões completas (`FROTA_SUGGESTIONS`) —
 * texto não tem limite de linhas como a lista nativa, então não precisa do
 * corte de `SUGESTOES_LISTA_NATIVA_WHATSAPP`.
 */
function construirFallbackNumerado(): string {
  const linhas = FROTA_SUGGESTIONS.map((s, i) => `${i + 1}. ${s.title}`).join("\n");
  return `${TEXTO_LISTA_SUGESTOES}\n\n${linhas}\n\nResponda com o número ou escreva sua pergunta normalmente.`;
}

/**
 * Envia as sugestões iniciais — lista nativa (única capacidade real do
 * adaptador atual pra isso, `sendWhatsappOptionList`, endpoint
 * `send-option-list` da Z-API) com fallback pra menu numerado em texto se o
 * envio da lista falhar. Nunca inventa um endpoint alternativo — o
 * fallback usa `sendWhatsappText`, que já existe.
 *
 * A lista nativa usa `SUGESTOES_LISTA_NATIVA_WHATSAPP` (10 itens), não
 * `FROTA_SUGGESTIONS` (11) — a lista nativa do WhatsApp Business tem limite
 * real de 10 linhas; o fallback em texto e o painel web continuam com as
 * 11 (ver comentário em frotaSuggestions.ts).
 *
 * Se cair no fallback, marca a sessão como "aguardando escolha numerada"
 * pra próxima mensagem poder ser interpretada como seleção (ver
 * `resolverSelecaoNumerada` em frotaSuggestions.ts) — nunca interpreta um
 * número solto fora desse contexto, pra não confundir com valor de cálculo.
 *
 * `collectedDataAtual` é sempre repassado por quem chama (nunca lido de
 * novo aqui) porque `updateOnboardingSession` substitui o campo inteiro —
 * sem isso, perderíamos os dados já coletados no onboarding.
 */
async function enviarSugestoesIniciais(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  phoneE164: string,
  collectedDataAtual: Record<string, unknown>
): Promise<void> {
  try {
    await sendWhatsappOptionList(
      phoneE164,
      TEXTO_LISTA_SUGESTOES,
      "Escolha uma opção",
      "Ver sugestões",
      SUGESTOES_LISTA_NATIVA_WHATSAPP.map((s) => ({ id: s.id, title: s.title, description: s.description }))
    );
    await sendWhatsappText(phoneE164, LEMBRETE_PERGUNTA_LIVRE).catch((err) => logZapiSendFailure(err, phoneE164, "sugestoes_lembrete_pergunta_livre"));
    await updateOnboardingSession(admin, userId, {
      collectedData: { ...collectedDataAtual, suggestionsMenuSentAt: new Date().toISOString(), awaitingNumberedMenuSelection: false },
    });
  } catch {
    await sendWhatsappText(phoneE164, construirFallbackNumerado()).catch((err) => logZapiSendFailure(err, phoneE164, "sugestoes_fallback_numerado"));
    await updateOnboardingSession(admin, userId, {
      collectedData: { ...collectedDataAtual, suggestionsMenuSentAt: new Date().toISOString(), awaitingNumberedMenuSelection: true },
    }).catch(() => {});
  }
}

function extrairTelefoneDoVcard(vcard?: string): string | null {
  const match = vcard?.match(/TEL[^:]*:([+\d()\-\s]+)/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(request: Request) {
  if (!isWhatsappConfigured()) {
    return NextResponse.json({ error: "WhatsApp não configurado." }, { status: 503 });
  }

  const { WHATSAPP_WEBHOOK_SECRET } = getWhatsappConfig();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokensMatch(token, WHATSAPP_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  }

  let body: ZApiWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Ignora eco de mensagens que o próprio número enviou e callbacks sem telefone.
  if (body.fromMe || !body.phone) {
    return NextResponse.json({ ok: true });
  }

  // Radar de Fretes (MVP): mensagem de GRUPO nunca passa por
  // resolveOrCreateUserByPhone/onboarding/conversation — desvia 100% pro
  // pipeline do Radar (pré-filtro → extração → matching), ou é ignorada se
  // o grupo não estiver na whitelist. Nunca responde no grupo.
  if (body.isGroup) {
    const textoGrupo = body.text?.message?.trim();
    if (textoGrupo) {
      const adminGrupo = createAdminClient();
      processarMensagemDeGrupo(adminGrupo, body.phone, body.chatName, textoGrupo, body.messageId, body).catch((err) => {
        captureError({ event: "whatsapp_grupo_processamento_falhou", route: ROTA, error: err });
      });
    }
    return NextResponse.json({ ok: true });
  }

  const phoneE164 = toPhoneE164(body.phone);
  const textoDireto = body.text?.message?.trim();
  const entradaOnboarding = resolverEntradaOnboarding(body);

  // Callback sem nenhum tipo reconhecido (ex.: status de entrega/leitura) — ignora.
  if (!entradaOnboarding && !body.image && !body.document && !body.audio && !body.location && !body.contact) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  // Resposta de checklist (Fase 6 do plano de unificação V1+V2) —
  // interceptado ANTES de resolveOrCreateUserByPhone, porque motorista NÃO
  // é conta de usuário: se deixasse cair no fluxo normal, o número do
  // motorista entraria no onboarding como se fosse um cliente novo.
  if (textoDireto) {
    const pendente = await findPendingChecklistDispatchByPhone(admin, phoneE164);
    if (pendente) {
      const atualizado = await recordChecklistResponse(admin, pendente.dispatch.id, textoDireto);
      const resposta =
        atualizado.response_status === "ok"
          ? "✅ Checklist registrado, tudo certo. Boa viagem!"
          : "⚠️ Checklist registrado. Reportei o problema — a gestão vai avaliar. Se for algo grave, não saia com o veículo antes de confirmar com a empresa.";
      await sendWhatsappText(phoneE164, resposta).catch((err) => logZapiSendFailure(err, phoneE164, "checklist_resposta_confirmacao"));
      return NextResponse.json({ ok: true });
    }
  }

  const { userId, channelId, isNew } = await resolveOrCreateUserByPhone(admin, body.phone, body.senderName);

  if (isNew) {
    // resolveOrCreateUserByPhone já criou a sessão de onboarding em awaiting_name.
    // Mensagem vinda de um CTA da landing (08/2026): guarda a oferta pretendida
    // no rascunho do onboarding (sobrevive a todas as etapas via spread, sem
    // precisar alterar a máquina de estados) — só é usada depois de concluído
    // (ver bloco de finalize abaixo), nunca pula o cadastro em si.
    const intencaoComercial = resolverIntencaoComercialLanding(textoDireto);
    if (intencaoComercial === "EMPRESAS") {
      await sendWhatsappText(phoneE164, MENSAGEM_INTERESSE_EMPRESAS).catch((err) => logZapiSendFailure(err, phoneE164, "landing_empresas_mensagem_interesse_novo"));
    } else if (intencaoComercial) {
      await updateOnboardingSession(admin, userId, { collectedData: { ofertaPretendida: intencaoComercial } }).catch(() => {});
    }
    await sendWhatsappText(phoneE164, firstOnboardingMessage()).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_primeira_mensagem_novo"));
    return NextResponse.json({ ok: true });
  }

  let session = await getOnboardingSession(admin, userId);

  if (!session) {
    // Usuário anterior à Camada 6 (ex.: veio do vínculo web da Camada 5).
    // Se já tem empresa, trata como onboarding concluído — nunca reabre o
    // onboarding de quem já usa o Frota IA. Se não tem, inicia agora.
    const contextoExistente = await loadCustomerContext(admin, userId);
    if (contextoExistente.company) {
      session = await createOnboardingSession(admin, userId, "completed");
    } else {
      session = await createOnboardingSession(admin, userId, "awaiting_name");
      await sendWhatsappText(phoneE164, firstOnboardingMessage()).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_primeira_mensagem_sessao_legada"));
      return NextResponse.json({ ok: true });
    }
  }

  if (session.state !== "completed") {
    // Proteção mínima contra reentrega do mesmo webhook durante o
    // onboarding (a auditoria apontou que, diferente do chat pós-onboarding,
    // esta fase não tinha nenhuma checagem de idempotência): se a última
    // mensagem processada com sucesso tiver o mesmo messageId, não
    // reprocessa — evita avançar o estado duas vezes com a mesma resposta.
    const ultimoMessageIdProcessado = (session.collected_data as Record<string, unknown> | null)?.__lastMessageId;
    if (body.messageId && ultimoMessageIdProcessado === body.messageId) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    if (!entradaOnboarding) {
      await sendWhatsappText(phoneE164, "Por enquanto, durante o cadastro, preciso que você responda em texto ou toque numa das opções.").catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_pede_texto_ou_toque"));
      return NextResponse.json({ ok: true });
    }

    const resultado = processOnboardingMessage(
      session.state,
      (session.collected_data ?? {}) as OnboardingCollectedData,
      entradaOnboarding
    );

    await updateOnboardingSession(admin, userId, {
      state: resultado.nextState,
      collectedData: {
        ...(resultado.collectedData as Record<string, unknown>),
        ...(body.messageId ? { __lastMessageId: body.messageId } : {}),
      },
    });

    if (resultado.finalize) {
      let empresaFinalizada;
      try {
        empresaFinalizada = await finalizeOnboarding(admin, userId, resultado.collectedData, phoneE164);
      } catch {
        await sendWhatsappText(
          phoneE164,
          "Tive um problema ao salvar seu cadastro agora. Pode mandar novamente sua última resposta?"
        ).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_finalizacao_falhou"));
        // Volta pra última pergunta antes da finalização (não pro início do
        // veículo) — reaproveita os dados já coletados e só pede a última
        // resposta de novo, retentando finalizeOnboarding a partir dali.
        await updateOnboardingSession(admin, userId, { state: "awaiting_consumption" });
        return NextResponse.json({ ok: true });
      }

      // Cadastro salvo com sucesso: mensagem fixa + as sugestões, só
      // desta vez (idempotência via suggestions_menu_sent_at em
      // collected_data — nunca reenviado automaticamente depois disso;
      // reabertura manual é só via "ajuda"/"menu"/"opções"/"sugestões" mais
      // abaixo no fluxo pós-onboarding).
      const collectedDataAtual = resultado.collectedData as Record<string, unknown>;
      if (!collectedDataAtual.suggestionsMenuSentAt) {
        const mensagem = construirMensagemPosCadastro(collectedDataAtual.intentId, collectedDataAtual.intentLabel);
        await sendWhatsappText(phoneE164, mensagem).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_mensagem_pos_cadastro"));
        await enviarSugestoesIniciais(admin, userId, phoneE164, collectedDataAtual);

        // Cliente veio de um CTA da landing (ver bloco isNew acima) — só
        // agora, com empresa criada, dá pra gerar o link de verdade. Preço e
        // entitlement continuam vindo só do catálogo (buildCheckoutLinkUrl só
        // carrega companyId + a chave do plano, nunca um valor).
        const ofertaPretendida = collectedDataAtual.ofertaPretendida;
        if (empresaFinalizada && typeof ofertaPretendida === "string" && isOfertaPlano(ofertaPretendida)) {
          const link = buildCheckoutLinkUrl(empresaFinalizada.id, ofertaPretendida);
          await sendWhatsappText(phoneE164, `${mensagemConfirmacaoOferta(ofertaPretendida)}\n\n${link}`).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_link_checkout_landing"));
        }

        // Guia de Primeiros Passos V1 (08/2026, validação 08/2026) —
        // oferecido uma única vez, logo após o cadastro (nunca antes:
        // onboarding/pagamento/entitlement não são tocados por este bloco).
        // `guide_v1_offered_at` garante a unicidade mesmo que o webhook seja
        // reentregue. Regra corrigida nesta validação: SÓ oferece quando
        // `isAccessAllowed` é true — antes checava só "empresa existe", e um
        // telefone que já tinha usado o trial antes recebia
        // `criarAssinaturaTeste` com status EXPIRADA na hora (ver
        // subscriptionService.ts), mas ainda assim recebia o convite do
        // guia por engano. Best-effort — nunca bloqueia a finalização do
        // onboarding se falhar.
        if (empresaFinalizada) {
          try {
            const assinaturaNova = await getSubscription(admin, empresaFinalizada.id);
            const guideState = await getGuideState(admin, empresaFinalizada.id, "v1");
            if (!guideState.offeredAt && isAccessAllowed(assinaturaNova)) {
              await enviarRespostaOnboarding(phoneE164, buildGuideOfferV1()).catch((err) => logZapiSendFailure(err, phoneE164, "guia_v1_oferta_pos_cadastro"));
              await markGuideOffered(admin, empresaFinalizada.id, "v1");
              logEvent({ event: "guide_v1_offered", route: ROTA, company_id: empresaFinalizada.id });
            }
          } catch {
            // Nunca bloqueia a finalização do onboarding por causa do guia.
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    await enviarRespostaOnboarding(phoneE164, resultado.reply).catch((err) => logZapiSendFailure(err, phoneE164, "onboarding_proxima_pergunta"));
    return NextResponse.json({ ok: true });
  }

  const customerContext = await loadCustomerContext(admin, userId);

  if (!customerContext.company) {
    await sendWhatsappText(
      phoneE164,
      "Falta concluir seu cadastro antes de conversar por aqui. Pode me dizer seu nome para começarmos?"
    ).catch((err) => logZapiSendFailure(err, phoneE164, "chat_sem_empresa_retoma_cadastro"));
    await updateOnboardingSession(admin, userId, { state: "awaiting_name" });
    return NextResponse.json({ ok: true });
  }

  const companyId = customerContext.company.id;
  const vehicleContext = await loadVehicleContext(admin, companyId);
  const conversation = await getOrCreateOpenConversation(admin, companyId, userId, channelId);
  const inboundBase: Partial<MessageInsert> = body.messageId ? { external_message_id: body.messageId } : {};

  // Guia de Primeiros Passos V1 (08/2026, validação 08/2026) —
  // determinístico, nunca a IA decide passo/transição/conclusão.
  // `guideStateV1` é lido uma vez por mensagem (cheap: 1 select indexado) e
  // usado em 2 pontos: interceptação de controle (abaixo, ANTES de
  // ehPedidoDeAjuda — um toque em "Próximo" do guia não deve cair em
  // nenhum outro interceptador) e, mais adiante, no lembrete pós-resposta
  // da IA (nunca perde o passo atual — seção 8 da spec: dúvida durante o
  // guia não trava nem reinicia o progresso).
  //
  // Regra corrigida nesta validação: interagir com o guia (controle
  // reconhecido OU comando manual de reabertura) exige `isAccessAllowed`
  // — antes disso, um cliente com trial/assinatura vencida ainda
  // conseguia avançar passos ou reabrir o guia livremente, contornando o
  // gate de assinatura (mais abaixo neste arquivo) só porque a
  // interceptação do guia acontecia antes dele. Sem acesso válido, a
  // mensagem simplesmente cai no fluxo normal, que bate no gate de
  // assinatura e mostra a mensagem de trial/assinatura vencida — igual
  // seria pra qualquer outra mensagem.
  const guideStateV1 = await getGuideState(admin, companyId, "v1");
  const guideStepV1 = guideStateV1.step as GuideStepV1 | null;
  let guideV1PrecisaLembrete = false;

  if (guideStateV1.status === "in_progress") {
    const controle = interpretarControleGuiaV1(entradaOnboarding);
    if (controle) {
      const assinaturaParaGuia = await getSubscription(admin, companyId);
      if (isAccessAllowed(assinaturaParaGuia)) {
        const intentId = customerContext.memories.find((m) => m.memory_type === "profile" && m.key === "initial_intent");
        const intentIdValor = (intentId?.value_json as { intentId?: string } | null)?.intentId;
        const veiculo = vehicleContext.vehicle;
        const resultado = processGuideControlV1(controle, guideStepV1, {
          intentId: intentIdValor,
          vehicle: veiculo
            ? {
                label: [veiculo.brand, veiculo.model, veiculo.model_year].filter(Boolean).join(" ") || "veículo cadastrado",
                consumo: veiculo.average_consumption_km_l ? `${veiculo.average_consumption_km_l} km/l` : undefined,
              }
            : undefined,
        });

        await saveGuideState(admin, companyId, "v1", { status: resultado.nextStatus, step: resultado.nextStep });
        await enviarRespostaOnboarding(phoneE164, resultado.reply).catch((err) => logZapiSendFailure(err, phoneE164, "guia_v1_resposta_controle"));
        logEvent({ event: `guide_v1_${resultado.nextStatus}`, route: ROTA, company_id: companyId, step: resultado.nextStep ?? guideStepV1 ?? "none" });
        return NextResponse.json({ ok: true });
      }
      // Sem acesso válido: não processa o controle do guia — cai pro fluxo normal (gate de assinatura mais abaixo).
    } else {
      // Controle não reconhecido: não intercepta — a mensagem segue pro
      // fluxo normal (IA responde de verdade), e um lembrete curto é
      // enviado depois, sem alterar o passo salvo.
      guideV1PrecisaLembrete = true;
    }
  }

  // Comando permanente ("primeiros passos"/"tutorial"/"guia"/etc, ver
  // ehPedidoDeGuia em helpMenu.ts) — funciona mesmo depois de dispensado
  // (seção 21: "não mostrar novamente" só desliga a oferta AUTOMÁTICA, o
  // comando manual sempre reabre) — SE o cliente tiver acesso válido.
  // Interceptado antes de ehPedidoDeAjuda pra não colidir com o menu de
  // sugestões.
  if (ehPedidoDeGuia(textoDireto) && guideStateV1.status !== "in_progress") {
    const assinaturaParaGuia = await getSubscription(admin, companyId);
    if (isAccessAllowed(assinaturaParaGuia)) {
      await enviarRespostaOnboarding(phoneE164, buildGuideReabrirV1(guideStateV1.status, guideStepV1)).catch((err) => logZapiSendFailure(err, phoneE164, "guia_v1_reabertura_manual"));
      return NextResponse.json({ ok: true });
    }
    // Sem acesso válido: cai pro fluxo normal (gate de assinatura mostra a mensagem de trial/assinatura vencida).
  }

  // Reabertura do menu por palavra-chave ("ajuda"/"menu"/"opções"/
  // "sugestões" etc.) — interceptado ANTES da IA, resposta determinística,
  // sem gastar chamada de modelo. Mostra de novo a mesma lista de 10,
  // independentemente de já ter sido enviada no fim do onboarding (nunca
  // checa suggestions_menu_sent_at aqui — reabertura manual é sempre
  // permitida).
  if (ehPedidoDeAjuda(textoDireto)) {
    await appendMessage(admin, {
      conversation_id: conversation.id,
      company_id: companyId,
      user_id: userId,
      role: "user",
      direction: "inbound",
      content: textoDireto ?? "",
      content_type: "text",
      ...inboundBase,
    });
    await enviarSugestoesIniciais(admin, userId, phoneE164, (session.collected_data ?? {}) as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  }

  // "O que você faz"/"quais suas funções" etc. — interceptado ANTES da IA,
  // mesmo princípio do bloco acima. Achado real em 07/08/2026: deixado pra
  // IA responder, ela resumiu e derrubou uma categoria inteira (Notícias do
  // setor) em vez de repetir o texto completo — pergunta mais sensível pra
  // um prospect decidir se continua, não pode depender do julgamento dela.
  if (ehPedidoDeFuncionalidades(textoDireto)) {
    await appendMessage(admin, {
      conversation_id: conversation.id,
      company_id: companyId,
      user_id: userId,
      role: "user",
      direction: "inbound",
      content: textoDireto ?? "",
      content_type: "text",
      ...inboundBase,
    });
    await sendWhatsappText(phoneE164, construirTextoAjudaCompleto()).catch((err) => logZapiSendFailure(err, phoneE164, "funcionalidades_texto_completo"));
    return NextResponse.json({ ok: true });
  }

  // Mensagem vinda de um CTA da landing page (08/2026) — cliente já
  // identificado (empresa existe). Interceptado ANTES da IA, mesmo
  // princípio dos dois blocos acima: a oferta já veio decidida da landing,
  // não faz sentido a IA perguntar "qual plano você quer" de novo. Funciona
  // mesmo com trial vencido (roda antes do gate de isAccessAllowed, mais
  // abaixo) — faz sentido: pagar é exatamente como se sai de um trial
  // vencido. Preço/entitlement continuam vindo só do catálogo — o texto da
  // mensagem nunca é usado pra nada além de escolher a CHAVE do plano.
  const intencaoComercial = resolverIntencaoComercialLanding(textoDireto);
  if (intencaoComercial) {
    await appendMessage(admin, {
      conversation_id: conversation.id,
      company_id: companyId,
      user_id: userId,
      role: "user",
      direction: "inbound",
      content: textoDireto ?? "",
      content_type: "text",
      ...inboundBase,
    });
    if (intencaoComercial === "EMPRESAS") {
      await sendWhatsappText(phoneE164, MENSAGEM_INTERESSE_EMPRESAS).catch((err) => logZapiSendFailure(err, phoneE164, "landing_empresas_mensagem_interesse_existente"));
    } else {
      const link = buildCheckoutLinkUrl(companyId, intencaoComercial);
      await sendWhatsappText(phoneE164, `${mensagemConfirmacaoOferta(intencaoComercial)}\n\n${link}`).catch((err) => logZapiSendFailure(err, phoneE164, "landing_link_checkout_cliente_existente"));
    }
    return NextResponse.json({ ok: true });
  }

  // Toque numa das sugestões (lista nativa mostra 10, fallback em texto mostra 11): equivale a "preencher e enviar" da web —
  // no WhatsApp não existe "só preencher", o toque já é o envio. Segue pro
  // fluxo normal da IA como se o cliente tivesse digitado o exemplo.
  const sugestaoSelecionada = body.listResponseMessage?.selectedRowId
    ? FROTA_SUGGESTIONS.find((s) => s.id === body.listResponseMessage?.selectedRowId)
    : undefined;

  // Fallback numerado: só interpreta "3" (ou o título exato) como escolha
  // quando a sessão está de fato aguardando essa resposta (marcado só
  // quando o envio da lista nativa falhou) — nunca em mensagem solta, pra
  // não confundir com um número de cálculo (ex.: "3" toneladas, "3" dias).
  const aguardandoSelecaoNumerada = Boolean((session.collected_data as Record<string, unknown> | null)?.awaitingNumberedMenuSelection);
  const selecaoNumerada = aguardandoSelecaoNumerada ? resolverSelecaoNumerada(textoDireto) : undefined;
  if (aguardandoSelecaoNumerada) {
    // Passou o momento de interpretar como escolha, tenha batido ou não —
    // nunca deixa a sessão esperando indefinidamente uma resposta numérica.
    await updateOnboardingSession(admin, userId, {
      collectedData: { ...(session.collected_data as Record<string, unknown>), awaitingNumberedMenuSelection: false },
    }).catch(() => {});
  }

  // "Ver tudo que o Frota IA faz" (toque na lista ou escolha numerada no
  // fallback) recebe o mesmo tratamento determinístico do texto digitado
  // "o que você faz" (ver ehPedidoDeFuncionalidades acima) — nunca deixa a
  // IA resumir livremente o catálogo completo.
  const idSugestaoVerTudo = (sugestaoSelecionada ?? selecaoNumerada)?.id === "ver_tudo";
  if (idSugestaoVerTudo) {
    await appendMessage(admin, {
      conversation_id: conversation.id,
      company_id: companyId,
      user_id: userId,
      role: "user",
      direction: "inbound",
      content: (sugestaoSelecionada ?? selecaoNumerada)!.whatsappDescription,
      content_type: "text",
      ...inboundBase,
    });
    await sendWhatsappText(phoneE164, construirTextoAjudaCompleto()).catch((err) => logZapiSendFailure(err, phoneE164, "sugestao_ver_tudo_texto_completo"));
    return NextResponse.json({ ok: true });
  }

  // Resolve o conteúdo desta mensagem: texto direto, ou mídia (Fase F).
  let mensagemUsuario: string | null = null;
  let conteudoMultimodal: Anthropic.ContentBlockParam[] | undefined;
  let inboundExtra: Partial<MessageInsert> = inboundBase;

  if (sugestaoSelecionada) {
    mensagemUsuario = sugestaoSelecionada.whatsappDescription;
  } else if (selecaoNumerada) {
    mensagemUsuario = selecaoNumerada.whatsappDescription;
  } else if (textoDireto) {
    mensagemUsuario = textoDireto;
  } else if (body.image?.imageUrl) {
    const mimeType = body.image.mimeType ?? "image/jpeg";
    if (!TIPOS_IMAGEM_SUPORTADOS.has(mimeType)) {
      await appendMessage(admin, {
        conversation_id: conversation.id,
        company_id: companyId,
        user_id: userId,
        role: "user",
        direction: "inbound",
        content: "[imagem recebida — formato não suportado]",
        content_type: "image",
        metadata: { mimeType },
        ...inboundBase,
      });
      await sendWhatsappText(phoneE164, "Recebi a imagem, mas esse formato ainda não é suportado. Pode mandar em JPEG, PNG, GIF ou WebP?").catch((err) => logZapiSendFailure(err, phoneE164, "imagem_formato_nao_suportado"));
      return NextResponse.json({ ok: true });
    }

    const midia = await baixarMidia(body.image.imageUrl);
    if (!midia) {
      captureError({ event: "whatsapp_midia_download_falhou", route: ROTA, media_type: "image", error: new Error("baixarMidia devolveu null pra imagem") });
      await sendWhatsappText(phoneE164, "Não consegui baixar a imagem agora. Pode tentar enviar de novo?").catch((err) => logZapiSendFailure(err, phoneE164, "imagem_download_falhou"));
      return NextResponse.json({ ok: true });
    }

    mensagemUsuario = body.image.caption?.trim() || "[imagem recebida]";
    conteudoMultimodal = [{ type: "image", source: { type: "base64", media_type: mimeType as "image/jpeg", data: paraBase64(midia.bytes) } }];
    inboundExtra = { ...inboundBase, content_type: "image", metadata: { mimeType, hadCaption: Boolean(body.image.caption) } };
  } else if (body.document?.documentUrl) {
    const mimeType = body.document.mimeType ?? "application/octet-stream";
    const fileName = body.document.fileName ?? "documento";

    if (MIME_TYPES_PLANILHA_SUPORTADOS.has(mimeType)) {
      const midiaPlanilha = await baixarMidia(body.document.documentUrl);
      if (!midiaPlanilha) {
        captureError({ event: "whatsapp_midia_download_falhou", route: ROTA, media_type: "spreadsheet", error: new Error("baixarMidia devolveu null pra planilha") });
        await sendWhatsappText(phoneE164, "Não consegui baixar a planilha agora. Pode tentar enviar de novo?").catch((err) => logZapiSendFailure(err, phoneE164, "planilha_download_falhou"));
        return NextResponse.json({ ok: true });
      }

      try {
        const textoPlanilha = await planilhaParaTexto(midiaPlanilha.bytes, mimeType);
        const legenda = body.document.caption?.trim();
        mensagemUsuario = `${legenda ? `${legenda}\n\n` : ""}[planilha recebida: ${fileName}]\n${textoPlanilha}`;
        inboundExtra = { ...inboundBase, content_type: "document", metadata: { fileName, mimeType, planilhaInterpretada: true } };
      } catch (err) {
        captureError({ event: "whatsapp_planilha_parse_falhou", route: ROTA, error: err });
        const motivo = err instanceof SpreadsheetParseError ? err.message : "Não consegui ler o conteúdo dessa planilha agora.";
        await appendMessage(admin, {
          conversation_id: conversation.id,
          company_id: companyId,
          user_id: userId,
          role: "user",
          direction: "inbound",
          content: `[planilha recebida: ${fileName} — falha ao interpretar]`,
          content_type: "document",
          metadata: { fileName, mimeType, planilhaInterpretada: false },
          ...inboundBase,
        });
        await sendWhatsappText(phoneE164, motivo).catch((err) => logZapiSendFailure(err, phoneE164, "planilha_parse_falhou"));
        return NextResponse.json({ ok: true });
      }
    } else if (mimeType !== "application/pdf") {
      await appendMessage(admin, {
        conversation_id: conversation.id,
        company_id: companyId,
        user_id: userId,
        role: "user",
        direction: "inbound",
        content: `[documento recebido: ${fileName} — conteúdo não interpretado]`,
        content_type: "document",
        metadata: { fileName, mimeType },
        ...inboundBase,
      });
      await sendWhatsappText(
        phoneE164,
        "Recebi o arquivo, mas só consigo ler o conteúdo de PDF, planilha (.xlsx) ou CSV — outros formatos de documento ainda não são interpretados."
      ).catch((err) => logZapiSendFailure(err, phoneE164, "documento_tipo_nao_suportado"));
      return NextResponse.json({ ok: true });
    } else {
      const midia = await baixarMidia(body.document.documentUrl);
      if (!midia) {
        captureError({ event: "whatsapp_midia_download_falhou", route: ROTA, media_type: "pdf", error: new Error("baixarMidia devolveu null pro documento") });
        await sendWhatsappText(phoneE164, "Não consegui baixar o documento agora. Pode tentar enviar de novo?").catch((err) => logZapiSendFailure(err, phoneE164, "documento_pdf_download_falhou"));
        return NextResponse.json({ ok: true });
      }

      mensagemUsuario = body.document.caption?.trim() || `[documento recebido: ${fileName}]`;
      conteudoMultimodal = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: paraBase64(midia.bytes) } }];
      inboundExtra = { ...inboundBase, content_type: "document", metadata: { fileName, mimeType } };
    }
  } else if (body.audio) {
    const audioMimeType = body.audio.mimeType ?? "audio/ogg";

    if (!isWhisperConfigured() || !body.audio.audioUrl) {
      await appendMessage(admin, {
        conversation_id: conversation.id,
        company_id: companyId,
        user_id: userId,
        role: "user",
        direction: "inbound",
        content: "[áudio recebido — não transcrito]",
        content_type: "audio",
        metadata: { mimeType: audioMimeType },
        ...inboundBase,
      });
      await sendWhatsappText(phoneE164, "Recebi seu áudio, mas ainda não consigo entender mensagens de voz — pode escrever, por favor?").catch((err) => logZapiSendFailure(err, phoneE164, "audio_transcricao_nao_configurada"));
      return NextResponse.json({ ok: true });
    }

    const midiaAudio = await baixarMidia(body.audio.audioUrl);
    if (!midiaAudio) {
      captureError({ event: "whatsapp_midia_download_falhou", route: ROTA, media_type: "audio", error: new Error("baixarMidia devolveu null pro áudio") });
      await sendWhatsappText(phoneE164, "Não consegui baixar seu áudio agora. Pode tentar enviar de novo, ou escrever a mensagem?").catch((err) => logZapiSendFailure(err, phoneE164, "audio_download_falhou"));
      return NextResponse.json({ ok: true });
    }

    try {
      const textoTranscrito = await transcreverAudio(midiaAudio.bytes, midiaAudio.contentType || audioMimeType);
      mensagemUsuario = textoTranscrito;
      inboundExtra = { ...inboundBase, content_type: "audio", metadata: { mimeType: audioMimeType, transcrito: true } };
    } catch (erroTranscricao) {
      captureError({ event: "whatsapp_transcricao_audio_falhou", route: ROTA, error: erroTranscricao });
      await appendMessage(admin, {
        conversation_id: conversation.id,
        company_id: companyId,
        user_id: userId,
        role: "user",
        direction: "inbound",
        content: "[áudio recebido — falha ao transcrever]",
        content_type: "audio",
        metadata: { mimeType: audioMimeType, transcrito: false },
        ...inboundBase,
      });
      await sendWhatsappText(phoneE164, "Recebi seu áudio, mas não consegui entender o que foi dito. Pode tentar de novo, mais claro, ou escrever a mensagem?").catch((err) => logZapiSendFailure(err, phoneE164, "audio_transcricao_falhou"));
      return NextResponse.json({ ok: true });
    }
  } else if (body.location) {
    const { latitude, longitude, name, address } = body.location;
    const partes = [name, address].filter(Boolean).join(", ");
    mensagemUsuario = `Localização recebida${partes ? ` (${partes})` : ""}: latitude ${latitude}, longitude ${longitude}.`;
    inboundExtra = { ...inboundBase, content_type: "location", metadata: { latitude: latitude ?? null, longitude: longitude ?? null, name: name ?? null, address: address ?? null } };
  } else if (body.contact) {
    const telefone = extrairTelefoneDoVcard(body.contact.vcard);
    mensagemUsuario = `Contato recebido: ${body.contact.displayName ?? "sem nome"}${telefone ? ` (${telefone})` : ""}.`;
    inboundExtra = { ...inboundBase, content_type: "contact", metadata: { displayName: body.contact.displayName ?? null, telefone } };
  }

  if (!mensagemUsuario) {
    return NextResponse.json({ ok: true });
  }

  // Bloqueio de acesso por assinatura (Fase 2 do fluxo de pagamento) — só
  // entra em vigor depois do onboarding (que sempre precisa completar pra
  // criar o teste em primeiro lugar). Mensagem que parece pedido de
  // assinatura passa direto (sem gastar chamada de IA nas demais, pra não
  // cobrar por conversa que o cliente não pode mais usar) — o
  // gerenciar_assinatura real acontece no fluxo normal logo abaixo.
  const assinatura = await getSubscription(admin, companyId);
  if (!isAccessAllowed(assinatura)) {
    const pareceQuererAssinar = /assin|contrat|pagar|pagamento|plano|mensalidade|renovar/i.test(mensagemUsuario);
    if (!pareceQuererAssinar) {
      await sendWhatsappText(
        phoneE164,
        "Seu período de teste gratuito do Frota IA terminou. Pra continuar usando, é só responder \"quero assinar\" que eu te mostro os planos disponíveis."
      ).catch((err) => logZapiSendFailure(err, phoneE164, "assinatura_bloqueio_acesso"));
      return NextResponse.json({ ok: true });
    }
  }

  try {
    const resposta = await gerarRespostaAssistente({
      client: admin,
      userId,
      companyId,
      conversation,
      customerContext,
      vehicleContext,
      mensagemUsuario,
      conteudoMultimodal,
      inboundMessageExtra: inboundExtra,
    });

    await sendWhatsappText(phoneE164, resposta.message.content);

    // Guia em andamento, mas esta mensagem não era um controle do guia (o
    // cliente perguntou/pediu algo de verdade, já respondido acima pela IA
    // de verdade — inclusive uma análise real, se foi o caso, seção 8/17 da
    // spec). Lembra que o guia continua pausado no mesmo passo, sem alterar
    // o estado salvo.
    if (guideV1PrecisaLembrete && guideStepV1) {
      await enviarRespostaOnboarding(phoneE164, buildGuideRetomarNudgeV1(guideStepV1)).catch((err) => logZapiSendFailure(err, phoneE164, "guia_v1_lembrete_retomada"));
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Reentrega do mesmo webhook (mesmo external_message_id) — já respondemos antes, não faz de novo.
      return NextResponse.json({ ok: true, deduped: true });
    }

    if (err instanceof AnthropicConfigError) {
      await sendWhatsappText(
        phoneE164,
        "Ainda não consigo responder automaticamente — a integração com a IA está sendo configurada. Tente novamente mais tarde."
      ).catch((err) => logZapiSendFailure(err, phoneE164, "anthropic_nao_configurado"));
      return NextResponse.json({ ok: true });
    }

    // Catch mais externo do pipeline inteiro (qualquer ferramenta, qualquer
    // parte de gerarRespostaAssistente, chamada à Anthropic) — sem log aqui
    // não dá pra saber o que quebrou quando cai nesse fallback genérico.
    captureError({ event: "whatsapp_resposta_ia_falhou", route: ROTA, company_id: companyId, conversation_id: conversation.id, error: err });
    await sendWhatsappText(phoneE164, "Não consegui processar sua mensagem agora. Tente novamente em instantes.").catch((err) => logZapiSendFailure(err, phoneE164, "resposta_ia_erro_generico"));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
