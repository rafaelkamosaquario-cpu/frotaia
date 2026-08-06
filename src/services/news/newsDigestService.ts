import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { construirFerramentaBuscaNoticias } from "@/lib/anthropic/tools";

const MAX_TOKENS = 1024;
const MAX_RODADAS_PAUSE_TURN = 2;

const PROMPT_SISTEMA = `Você gera um resumo curtíssimo de notícias do setor de transporte
rodoviário de cargas no Brasil (fretes, combustível, pedágio, legislação,
estradas/PRF/DNIT, novidades de fabricante) para envio via WhatsApp a um
motorista/transportador.

Regras:
- Busque nas fontes disponíveis e escolha só 2 a 3 notícias relevantes das
  últimas 24-48h. Se não achar nada relevante e recente, diga isso em uma
  linha só — nunca invente notícia.
- Formato por notícia: uma linha com o título/resumo em 1 frase curta, e
  logo abaixo o link direto da matéria (não o link genérico do domínio).
- Sem introdução, sem despedida, sem parágrafo explicando conceito. Direto
  ao ponto, no máximo 3 notícias.
- Comece a mensagem com "📰 Notícias do setor hoje:".`;

/**
 * Gera o texto do resumo diário de notícias via Claude + busca restrita à
 * imprensa/entidades do transporte (`construirFerramentaBuscaNoticias`).
 * Chamada única de negócio (não é uma conversa), por isso não usa o loop
 * completo de `gerarRespostaAssistente.ts` — só trata `pause_turn` (mesma
 * razão do loop principal: continuação da própria Anthropic no meio de uma
 * busca server-side, não é tool_use nosso).
 */
export async function gerarResumoNoticias(): Promise<string | null> {
  const anthropic = createAnthropicClient();
  const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: "Gere o resumo de hoje." }];

  for (let rodada = 0; rodada <= MAX_RODADAS_PAUSE_TURN; rodada++) {
    const resposta = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: PROMPT_SISTEMA,
      tools: [construirFerramentaBuscaNoticias()],
      messages: mensagens,
    });

    if (resposta.stop_reason === "pause_turn" && rodada < MAX_RODADAS_PAUSE_TURN) {
      mensagens.push({ role: "assistant", content: resposta.content });
      continue;
    }

    const texto = resposta.content
      .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
      .map((bloco) => bloco.text)
      .join("\n")
      .trim();

    return texto || null;
  }

  return null;
}
