import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";

/**
 * "Frota IA sugere" no Dashboard (V2): 1-2 frases geradas a partir do
 * resumo operacional já carregado na tela — nunca chama ferramenta nem
 * busca externa, só resume o que já está na tela. Chamada única de
 * negócio, mesmo padrão de newsDigestService.ts (sem o loop completo de
 * gerarRespostaAssistente.ts, que é pra conversa). O cache (quando gerar
 * de novo) fica por conta de quem chama — ver company_preferences
 * dashboard_insight_text/dashboard_insight_generated_at.
 */

const MAX_TOKENS = 300;

const PROMPT_SISTEMA = `Você analisa um resumo operacional curto de uma frota de transporte
rodoviário de cargas e escreve no máximo 2 frases curtas destacando o que
mais merece atenção agora (ou confirmando que está tudo em ordem).

Regras:
- Nunca invente dado que não está no resumo fornecido.
- Direto ao ponto, sem saudação, sem introdução, sem markdown, sem emoji.
- Se não houver nada relevante a destacar, diga isso em 1 frase curta (ex.: "Nenhuma pendência crítica no momento.").
- No máximo 2 frases.`;

export async function gerarInsightDashboard(resumoDados: string): Promise<string | null> {
  const anthropic = createAnthropicClient();

  const resposta = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: PROMPT_SISTEMA,
    messages: [{ role: "user", content: resumoDados }],
  });

  const texto = resposta.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();

  return texto || null;
}
