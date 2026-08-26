import type Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AnthropicConfigError } from "@/lib/anthropic/client";
import { loadCustomerContext, loadVehicleContext } from "@/ai/context/customerContext";
import { getConversationById, getOrCreateOpenConversation } from "@/services/supabase/conversationService";
import { gerarRespostaAssistente } from "@/ai/chat/gerarRespostaAssistente";
import { captureError } from "@/lib/observability/logger";

const ROTA = "/api/chat";

/** Mesmo conjunto aceito pelo webhook do WhatsApp (ver TIPOS_IMAGEM_SUPORTADOS em src/app/api/whatsapp/webhook/route.ts). */
const TIPOS_IMAGEM_SUPORTADOS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface ChatRequestBody {
  conversationId?: string;
  message?: string;
  /** Rótulo da tela do painel de onde a pergunta foi feita (ex.: "Manutenção") — ver Fase de contexto de página do widget. Nunca persiste no histórico como texto do usuário. */
  pageContext?: string;
  /** Foto/documento anexado no widget do painel — mesmo pipeline de visão já usado pelo WhatsApp. */
  image?: { mimeType?: string; data?: string };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const mensagemUsuario = body.message?.trim();
  if (!mensagemUsuario) {
    return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  }

  const userId = authData.user.id;
  const customerContext = await loadCustomerContext(supabase, userId);

  if (!customerContext.company) {
    return NextResponse.json({ error: "Cadastro incompleto. Finalize o onboarding antes de conversar." }, { status: 409 });
  }

  const companyId = customerContext.company.id;
  const vehicleContext = await loadVehicleContext(supabase, companyId);

  const conversation = body.conversationId
    ? await getConversationById(supabase, body.conversationId)
    : await getOrCreateOpenConversation(supabase, companyId, userId);

  if (!conversation || conversation.user_id !== userId) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  if (body.image?.data && (!body.image.mimeType || !TIPOS_IMAGEM_SUPORTADOS.has(body.image.mimeType))) {
    return NextResponse.json({ error: "Formato de imagem não suportado (use JPEG, PNG, GIF ou WebP)." }, { status: 400 });
  }

  const conteudoMultimodal: Anthropic.ContentBlockParam[] = [];
  if (body.pageContext) {
    conteudoMultimodal.push({ type: "text", text: `Contexto: o usuário está na tela "${body.pageContext}" do painel de gestão.` });
  }
  if (body.image?.data && body.image.mimeType) {
    conteudoMultimodal.push({
      type: "image",
      source: { type: "base64", media_type: body.image.mimeType as "image/jpeg", data: body.image.data },
    });
  }

  try {
    const resposta = await gerarRespostaAssistente({
      client: supabase,
      userId,
      companyId,
      conversation,
      customerContext,
      vehicleContext,
      mensagemUsuario,
      conteudoMultimodal: conteudoMultimodal.length > 0 ? conteudoMultimodal : undefined,
    });

    return NextResponse.json(resposta);
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json(
        { error: "A integração com a Claude API ainda não foi configurada (ANTHROPIC_API_KEY ausente)." },
        { status: 503 }
      );
    }
    captureError({ event: "chat_resposta_ia_falhou", route: ROTA, company_id: companyId, conversation_id: conversation.id, error: err });
    return NextResponse.json({ error: "Não foi possível obter resposta da IA agora. Tente novamente." }, { status: 502 });
  }
}
