import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { freightOpportunityExtractionSchema } from "@/lib/validation/schemas";
import type { z } from "zod";

/**
 * Radar de Fretes (MVP) — extração estruturada de uma mensagem de grupo que
 * já passou no pré-filtro barato (cheapFilter.ts). Chamada única de negócio,
 * sem tools, mesmo padrão de dashboardInsightService.ts/newsDigestService.ts
 * — nunca o loop completo de gerarRespostaAssistente.ts (isso é caro e é
 * pra conversa real, não pra triagem em massa de mensagem de grupo).
 *
 * Nunca inventa campo — instrução explícita no prompt, e o schema Zod exige
 * null em vez de omitir. Se o parse falhar, devolve null (chamador decide
 * não criar oportunidade em vez de gravar dado corrompido — etapa 58 da spec).
 */

export type ExtracaoOportunidade = z.infer<typeof freightOpportunityExtractionSchema>;

const MAX_TOKENS = 500;

const PROMPT_SISTEMA = `Você extrai dados estruturados de uma mensagem de grupo de WhatsApp que PARECE ser uma oferta de frete/carga (origem, destino, peso, carroceria, valor).

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, sem markdown, no formato exato:
{
  "pareceOfertaDeFrete": boolean,
  "originCity": string ou null,
  "originState": string (UF, 2 letras maiúsculas) ou null,
  "destinationCity": string ou null,
  "destinationState": string (UF, 2 letras maiúsculas) ou null,
  "pickupDate": string "YYYY-MM-DD" ou null,
  "bodyType": um de "sider","graneleiro","bau","cacamba","tanque","grade_baixa","prancha","frigorifico","outro" ou null,
  "weightKg": number ou null,
  "freightValueCents": number (valor em centavos, ex.: R$8.500,00 = 850000) ou null,
  "contactText": string (telefone/nome de contato mencionado no texto, se houver) ou null
}

Regras:
- pareceOfertaDeFrete = false se o texto claramente NÃO é uma oferta de carga (conversa social, pergunta não relacionada) — nesse caso todos os outros campos ficam null.
- NUNCA invente um campo que não está claramente no texto — use null.
- Cidade sem estado explícito: só preencha o estado se você tiver certeza (ex.: "Goiânia" é sempre GO); se ambíguo, deixe originState/destinationState null mesmo com a cidade preenchida.
- Data: só preencha se houver data relativa clara ("amanhã", "segunda") ou absoluta — resolva pra uma data real usando a data de hoje informada abaixo. Sem indicação de data, deixe null.
- Valor: só preencha se houver número claramente associado a preço/frete (R$, "reais") — nunca confunda com peso ou distância.`;

export async function extrairOportunidadeDeTexto(texto: string, dataDeHoje: string): Promise<ExtracaoOportunidade | null> {
  const anthropic = createAnthropicClient();

  const resposta = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: `${PROMPT_SISTEMA}\n\nData de hoje: ${dataDeHoje}.`,
    messages: [{ role: "user", content: texto }],
  });

  const textoResposta = resposta.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("\n")
    .trim();

  if (!textoResposta) return null;

  try {
    const json: unknown = JSON.parse(textoResposta);
    const parsed = freightOpportunityExtractionSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
