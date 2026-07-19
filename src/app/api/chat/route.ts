import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { PROMPT_MESTRE } from "@/ai/prompt-mestre";

const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 1536;

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não está configurada no servidor." },
      { status: 500 }
    );
  }

  let messages: ChatRequestMessage[];
  try {
    const body = (await request.json()) as { messages?: ChatRequestMessage[] };
    messages = body.messages ?? [];
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "Nenhuma mensagem enviada." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: PROMPT_MESTRE,
      messages: messages.map(({ role, content }) => ({ role, content })),
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    return NextResponse.json({ content: textBlock?.text ?? "" });
  } catch (error) {
    console.error("api/chat: erro ao chamar a Claude API", error);
    return NextResponse.json(
      { error: "Não foi possível obter resposta do assistente." },
      { status: 502 }
    );
  }
}
