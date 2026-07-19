import type { ChatImage, ChatMessage, MessageRole } from "@/types";
import { generateId } from "@/lib/utils";

/**
 * Fabrica e utilitarios de mensagens. Fase 1: geracao local apenas,
 * sem persistencia remota — preparado para ser trocado por chamadas
 * de API na Fase 2.
 */

export function createMessage(
    role: MessageRole,
    content: string,
    image?: ChatImage
  ): ChatMessage {
    return {
          id: generateId(),
          role,
          content,
          createdAt: new Date().toISOString(),
          status: "sent",
          ...(image ? { image } : {}),
    };
}
