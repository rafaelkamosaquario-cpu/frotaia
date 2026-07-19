import { NextResponse } from "next/server";
import { getChatResponse, type ClaudeChatMessage } from "@/ai/claude";

// Forca runtime Node.js (nao Edge) — necessario para o `fs` usado em claude.ts.
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 8000;
const MAX_IMAGE_BASE64_LENGTH = 7_000_000; // ~5MB de imagem original
const ACCEPTED_IMAGE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const GENERIC_ERROR =
  "Nao foi possivel concluir sua analise agora. Tente novamente em alguns instantes.";

function isValidImage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const { mediaType, data } = value as Record<string, unknown>;
  return (
    typeof mediaType === "string" &&
    ACCEPTED_IMAGE_MEDIA_TYPES.has(mediaType) &&
    typeof data === "string" &&
    data.length > 0 &&
    data.length <= MAX_IMAGE_BASE64_LENGTH
  );
}

function isValidMessage(value: unknown): value is ClaudeChatMessage {
  if (!value || typeof value !== "object") return false;
  const { role, content, image } = value as Record<string, unknown>;

  if (role !== "user" && role !== "assistant") return false;
  if (typeof content !== "string" || content.length > MAX_MESSAGE_LENGTH) return false;
  if (image !== undefined && !isValidImage(image)) return false;
  if (content.trim().length === 0 && image === undefined) return false;

  return true;
}

export async function POST(request: Request) {
  let rawMessages: unknown[];

  try {
    const body = (await request.json()) as { messages?: unknown };
    rawMessages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ error: "Requisicao invalida." }, { status: 400 });
  }

  if (rawMessages.length === 0) {
    return NextResponse.json({ error: "Nenhuma mensagem enviada." }, { status: 400 });
  }

  // Rejeita a requisicao inteira se qualquer mensagem for invalida — nunca
  // descarta mensagens silenciosamente, o que enviaria a Claude um historico
  // incompleto sem a pergunta atual do usuario.
  if (!rawMessages.every(isValidMessage)) {
    return NextResponse.json({ error: "Mensagens em formato invalido." }, { status: 400 });
  }

  const messages = rawMessages as ClaudeChatMessage[];

  try {
    const response = await getChatResponse(messages);
    return NextResponse.json({ response });
  } catch {
    // getChatResponse ja loga a causa real no servidor — aqui so repassamos
    // uma mensagem generica, sem stack trace, chave de API ou detalhes internos.
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
  }
}
