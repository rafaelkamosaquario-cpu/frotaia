export type MessageRole = "user" | "assistant";

export type MessageStatus = "sending" | "sent" | "error";

export interface ChatImage {
    mediaType: string;
    data: string;
    name?: string;
}

export interface ChatMessage {
    id: string;
    role: MessageRole;
    content: string;
    createdAt: string;
    status?: MessageStatus;
    image?: ChatImage;
}

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: string;
    updatedAt: string;
}

export interface SuggestionPrompt {
    id: string;
    label: string;
    description: string;
    prompt: string;
    icon: SuggestionIconName;
}

export type SuggestionIconName =
    | "truck"
  | "package"
  | "fuel"
  | "circleDot"
  | "barChart3"
  | "wallet";
