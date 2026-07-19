import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { PROMPT_MESTRE } from "./prompt-mestre";
import { TOOLS, executeTool } from "./tools";

/**
 * Ponte entre o backend do Frota IA Assistente e a Claude API.
 * Unico modulo com acesso a ANTHROPIC_API_KEY — o import "server-only" faz
 * o build falhar caso este arquivo seja importado por um componente cliente.
 */

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_TOOL_ITERATIONS = 5;

export interface ClaudeChatImage {
  mediaType: string;
  data: string;
}

export interface ClaudeChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: ClaudeChatImage;
}

const KNOWLEDGE_SECTIONS: { title: string; file: string }[] = [
  { title: "TRANSPORTE", file: "transporte.md" },
  { title: "FRETES", file: "fretes.md" },
  { title: "CPK E ROTAS", file: "cpk.md" },
  { title: "PNEUS", file: "pneus.md" },
  { title: "COMBUSTIVEL", file: "combustivel.md" },
  { title: "MANUTENCAO", file: "manutencao.md" },
  { title: "LEGISLACAO", file: "legislacao.md" },
];

function readKnowledgeFile(filename: string): string {
  const filePath = path.join(process.cwd(), "src", "ai", "conhecimentos", filename);
  return fs.readFileSync(filePath, "utf-8").trim();
}

function buildSystemPrompt(): string {
  const blocks = [
    `--- INICIO DO PROMPT MESTRE ---\n\n${PROMPT_MESTRE}\n\n--- FIM DO PROMPT MESTRE ---`,
    ...KNOWLEDGE_SECTIONS.map(({ title, file }) => {
      const content = readKnowledgeFile(file);
      return `--- CONHECIMENTO: ${title} ---\n\n${content}\n\n--- FIM DO CONHECIMENTO: ${title} ---`;
    }),
  ];

  return blocks.join("\n\n");
}

// Montado uma unica vez por processo do servidor (o prompt mestre e a base
// de conhecimento nao mudam durante a execucao).
let cachedSystemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = buildSystemPrompt();
  }
  return cachedSystemPrompt;
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("claude.ts: ANTHROPIC_API_KEY nao esta configurada no servidor.");
    throw new Error("Assistente indisponivel no momento.");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Monta o conteudo de uma mensagem no formato aceito pela Claude API.
 * Quando ha imagem, retorna um array de blocos (imagem + texto opcional).
 * Quando nao ha imagem, retorna a string simples (formato mais leve).
 */
function toAnthropicContent(message: ClaudeChatMessage): string | Record<string, unknown>[] {
  if (!message.image) {
    return message.content;
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: message.image.mediaType,
        data: message.image.data,
      },
    },
  ];

  if (message.content.trim()) {
    blocks.push({ type: "text", text: message.content });
  }

  return blocks;
}

/**
 * Envia o historico da conversa (mensagens do usuario e do assistente) para
 * a Claude API, com o Prompt Mestre + Base de Conhecimento como system
 * prompt e as ferramentas de calculo disponiveis (tool use), e retorna o
 * texto da resposta final.
 */
export async function getChatResponse(messages: ClaudeChatMessage[]): Promise<string> {
  const client = getClient();

  const conversation: Record<string, unknown>[] = messages.map((message) => ({
    role: message.role,
    content: toAnthropicContent(message),
  }));

  try {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: getSystemPrompt(),
          tools: TOOLS as unknown as Anthropic.Tool[],
          messages: conversation as unknown as Anthropic.MessageParam[],
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === "text"
        );

        return (
          textBlock?.text.trim() ||
          "Nao consegui elaborar uma resposta para essa pergunta. Pode reformular?"
        );
      }

      // Anexa a resposta do assistente (incluindo os blocos de tool_use) ao historico.
      conversation.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block: { type: string }) => block.type === "tool_use"
      ) as unknown as { id: string; name: string; input: Record<string, unknown> }[];

      const toolResults = toolUseBlocks.map((block) => {
        const result = executeTool(block.name, block.input);
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      });

      conversation.push({ role: "user", content: toolResults });
    }

    throw new Error("Numero maximo de chamadas de ferramenta excedido.");
  } catch (error) {
    console.error("claude.ts: erro ao chamar a Claude API", error);
    throw new Error(
      "Nao foi possivel concluir sua analise agora. Tente novamente em alguns instantes."
    );
  }
}
