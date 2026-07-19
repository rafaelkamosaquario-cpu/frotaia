import type { ChatMessage } from "@/types";

/**
 * Camada de integração com o provedor de IA (Claude API).
 * A chamada real acontece no servidor (rota `/api/chat`), que é a única
 * peça com acesso à ANTHROPIC_API_KEY — o cliente nunca vê a chave.
 */

export interface AICompletionRequest {
  messages: ChatMessage[];
}

export interface AICompletionResponse {
  content: string;
}

const REQUEST_TIMEOUT_MS = 50_000;

export async function requestAICompletion(
  request: AICompletionRequest
): Promise<AICompletionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: request.messages.map(({ role, content }) => ({ role, content })),
      }),
      signal: controller.signal,
    });
  } catch {
    throw new Error("Falha ao consultar o assistente de IA.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error("Falha ao consultar o assistente de IA.");
  }

  const data = (await response.json()) as { response: string };
  return { content: data.response };
}
