import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-sonnet-5";

export class AnthropicConfigError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY não configurada.");
    this.name = "AnthropicConfigError";
  }
}

/**
 * Timeout por chamada (prontidão de produção, 08/2026) — o padrão do SDK é
 * 10 minutos, adequado pra job em lote, não pra um webhook de chat
 * interativo (o cliente no WhatsApp/painel está esperando resposta). Até
 * MAX_TOOL_ROUNDS+1 chamadas podem acontecer numa mensagem
 * (gerarRespostaAssistente.ts) — 90s por chamada cobre tool use com busca
 * web sem deixar o webhook pendurado por minutos.
 *
 * `maxRetries` NÃO é definido aqui de propósito — o padrão do SDK (2
 * tentativas) já trata 429/5xx corretamente, incluindo respeitar os
 * headers `retry-after`/`retry-after-ms` quando a API devolve (ver
 * node_modules/@anthropic-ai/sdk/src/client.ts, shouldRetry/status 429) —
 * reimplementar isso na aplicação seria redundante.
 */
const ANTHROPIC_TIMEOUT_MS = 90_000;

export function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AnthropicConfigError();
  return new Anthropic({ apiKey, timeout: ANTHROPIC_TIMEOUT_MS });
}
