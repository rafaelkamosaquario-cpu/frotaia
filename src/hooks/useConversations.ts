"use client";

import { useCallback, useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { MOCK_CONVERSATIONS } from "@/lib/mock-data";
import { truncate } from "@/lib/utils";
import type { ChatMessage, Conversation } from "@/types";

const STORAGE_KEY = "frota-ia:conversations";

/**
 * Gerencia a lista de conversas exibida na barra lateral (histórico).
 * Fase 1: persistência simulada via localStorage, sem backend.
 */
export function useConversations() {
  const [conversations, setConversations] = useLocalStorage<Conversation[]>(
    STORAGE_KEY,
    MOCK_CONVERSATIONS
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? null;

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
      setActiveConversationId((current) => (current === id ? null : current));
    },
    [setConversations]
  );

  const persistConversation = useCallback(
    (id: string, messages: ChatMessage[], titleHint?: string) => {
      setConversations((prev) => {
        const now = new Date().toISOString();
        const existing = prev.find((conversation) => conversation.id === id);

        if (existing) {
          return prev.map((conversation) =>
            conversation.id === id ? { ...conversation, messages, updatedAt: now } : conversation
          );
        }

        // Título do histórico: hoje é apenas a primeira mensagem do usuário
        // truncada. Futuramente será gerado pela IA a partir do conteúdo da
        // conversa (ex.: "📦 Frete Curitiba → São Paulo", "📊 CPK Volvo FH",
        // "🛞 Comparação Michelin x Recapado", "⛽ Consumo Scania R450").
        const created: Conversation = {
          id,
          title: titleHint ? truncate(titleHint, 48) : "Nova conversa",
          messages,
          createdAt: now,
          updatedAt: now,
        };
        return [created, ...prev];
      });
      setActiveConversationId(id);
    },
    [setConversations]
  );

  return {
    conversations,
    activeConversationId,
    activeConversation,
    startNewConversation,
    selectConversation,
    deleteConversation,
    persistConversation,
  };
}
