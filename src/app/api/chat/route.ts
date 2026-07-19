import { NextResponse } from "next/server";
import { getChatResponse, type ClaudeChatMessage } from "@/ai/claude";

// Força runtime Node.js (não Edge) — necessário para o `fs` usado em claude.ts.
export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 8000;
const GENERIC_ERROR =
  "Não foi possível concluir sua análise agora. Tente novamente em alguns instantes.";

function isValidMessage(value: unknown): value is ClaudeChatMessage {
  if (!value || typeof value !== "object") return false;
  const { role, content } = value as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") &&
    typeof content === "string" &&
    content.trim().length > 0 &&
    content.length <= MAX_MESSAGE_LENGTH
  );
}

export async function POST(request: Request) {
  let messages: ClaudeChatMessage[];

  try {
    const body = (await request.json()) as { messages?: unknown };
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    messages = rawMessages.filter(isValidMessage);
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "Nenhuma mensagem válida enviada." }, { status: 400 });
  }

  try {
    const response = await getChatResponse(messages);
    return NextResponse.json({ response });
  } catch {
    // getChatResponse já loga a causa real no servidor — aqui só repassamos
    // uma mensagem genérica, sem stack trace, chave de API ou detalhes internos.
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
  }
}
