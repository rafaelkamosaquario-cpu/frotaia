import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { PROMPT_MESTRE } from "./prompt-mestre";

/**
 * Ponte entre o backend do Frota IA Assistente e a Claude API.
 * Único módulo com acesso à ANTHROPIC_API_KEY — o import "server-only" faz
 * o build falhar caso este arquivo seja importado por um componente cliente.
 */

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

export interface ClaudeChatMessage {
  role: "user" | "assistant";
  content: string;
}

const KNOWLEDGE_SECTIONS: { title: string; file: string }[] = [
  { title: "TRANSPORTE", file: "transporte.md" },
  { title: "FRETES", file: "fretes.md" },
  { title: "CPK E ROTAS", file: "cpk.md" },
  { title: "PNEUS", file: "pneus.md" },
  { title: "COMBUSTÍVEL", file: "combustivel.md" },
  { title: "MANUTENÇÃO", file: "manutencao.md" },
  { title: "LEGISLAÇÃO", file: "legislacao.md" },
];

function readKnowledgeFile(filename: string): string {
  const filePath = path.join(process.cwd(), "src", "ai", "conhecimentos", filename);
  return fs.readFileSync(filePath, "utf-8").trim();
}

function buildSystemPrompt(): string {
  const blocks = [
    `--- INÍCIO DO PROMPT MESTRE ---\n\n${PROMPT_MESTRE}\n\n--- FIM DO PROMPT MESTRE ---`,
    ...KNOWLEDGE_SECTIONS.map(({ title, file }) => {
      const content = readKnowledgeFile(file);
      return `--- CONHECIMENTO: ${title} ---\n\n${content}\n\n--- FIM DO CONHECIMENTO: ${title} ---`;
    }),
  ];

  return blocks.join("\n\n");
}

// Montado uma única vez por processo do servidor (o prompt mestre e a base
// de conhecimento não mudam durante a execução).
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
    console.error("claude.ts: ANTHROPIC_API_KEY não está configurada no servidor.");
    throw new Error("Assistente indisponível no momento.");
  }

  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/**
 * Envia o histórico da conversa (mensagens do usuário e do assistente) para
 * a Claude API, com o Prompt Mestre + Base de Conhecimento como system
 * prompt, e retorna o texto da resposta.
 */
export async function getChatResponse(messages: ClaudeChatMessage[]): Promise<string> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: getSystemPrompt(),
      messages: messages.map(({ role, content }) => ({ role, content })),
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    return (
      textBlock?.text.trim() ||
      "Não consegui elaborar uma resposta para essa pergunta. Pode reformular?"
    );
  } catch (error) {
    console.error("claude.ts: erro ao chamar a Claude API", error);
    throw new Error(
      "Não foi possível concluir sua análise agora. Tente novamente em alguns instantes."
    );
  }
}
