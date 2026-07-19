"use client";

import { useCallback, useState } from "react";
import { createMessage } from "@/services/messageService";
import { requestAICompletion } from "@/services/aiService";
import { generateId } from "@/lib/utils";
import { ERROR_RESPONSE } from "@/lib/constants";
import type { ChatMessage, Conversation } from "@/types";

const EMPTY_MESSAGES: ChatMessage[] = [];

interface UseChatOptions {
  conversation: Conversation | null;
  onPersist: (id: string, messages: ChatMessage[], titleHint?: string) => void;
}

/**
 * Controla o envio de mensagens de uma conversa. As mensagens vêm sempre da
 * conversa ativa (fonte única de verdade); este hook só adiciona o estado
 * de "digitando" e a chamada ao assistente de IA (via aiService).
 */
export function useChat({ conversation, onPersist }: UseChatOptions) {
  const [isTyping, setIsTyping] = useState(false);

  const messages = conversation?.messages ?? EMPTY_MESSAGES;

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isTyping) return;

      const conversationId = conversation?.id ?? generateId();
      const userMessage = createMessage("user", trimmed);
      const messagesWithUser = [...messages, userMessage];

      onPersist(conversationId, messagesWithUser, trimmed);
      setIsTyping(true);

      requestAICompletion({ messages: messagesWithUser })
        .then(({ content: reply }) => {
          const assistantMessage = createMessage("assistant", reply);
          onPersist(conversationId, [...messagesWithUser, assistantMessage]);
        })
        .catch(() => {
          const assistantMessage = createMessage("assistant", ERROR_RESPONSE);
          onPersist(conversationId, [...messagesWithUser, assistantMessage]);
        })
        .finally(() => {
          setIsTyping(false);
        });
    },
    [conversation?.id, messages, isTyping, onPersist]
  );

  return { messages, isTyping, sendMessage };
}
