"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
export type AssistantNotice = { id: string; text: string; href: string; question: string };
type Snapshot = { notices: AssistantNotice[]; label: string };
const Context = createContext<{
  snapshot: Snapshot | null; publish: (value: Snapshot | null) => void;
  read: string[]; markRead: (id: string) => void;
} | null>(null);

// Scoped to the selected company. Read state is deliberately session-only;
// acknowledging a notice never resolves or pays the underlying record.
export function AssistantNoticesProvider({ children }: { children: ReactNode }) {
  const [snapshot, publish] = useState<Snapshot | null>(null);
  const [read, setRead] = useState<string[]>([]);
  return <Context.Provider value={{ snapshot, publish, read, markRead: id => setRead(previous => previous.includes(id) ? previous : [...previous, id]) }}>{children}</Context.Provider>;
}
export function useAssistantNotices() { return useContext(Context); }
