"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function parse<T>(raw: string | null, initialValue: T): T {
  if (!raw) return initialValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}

/**
 * Sincroniza um estado com localStorage usando useSyncExternalStore, para
 * que o valor persistido seja lido de forma segura para hidratação (sem
 * "piscar" o valor inicial e sem efeitos que disparem setState).
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const getSnapshot = useCallback(() => window.localStorage.getItem(key), [key]);
  const getServerSnapshot = useCallback(() => null, []);

  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const value = parse(raw, initialValue);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      // Lê o valor atual diretamente do localStorage (não do closure do
      // último render) para que chamadas em sequência — como persistir a
      // mensagem do usuário e, pouco depois, a resposta do assistente —
      // sempre partam do estado mais recente, mesmo que a segunda chamada
      // aconteça antes de um novo render.
      const current = parse(window.localStorage.getItem(key), initialValue);
      const resolved = next instanceof Function ? next(current) : next;
      const serialized = JSON.stringify(resolved);
      window.localStorage.setItem(key, serialized);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: serialized }));
    },
    [key, initialValue]
  );

  return [value, setValue] as const;
}
