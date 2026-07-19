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

export async function requestAICompletion(
  request: AICompletionRequest
): Promise<AICompletionResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: request.messages.map(({ role, content }) => ({ role, content })),
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Falha ao consultar o assistente de IA.");
  }

  return (await response.json()) as AICompletionResponse;
}
