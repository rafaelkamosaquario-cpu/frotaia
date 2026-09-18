"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useHasMounted } from "@/hooks/useHasMounted";
import { cn } from "@/lib/utils";

export function FrotaThemeSelector() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHasMounted();
  return (
    <div role="group" aria-label="Tema do painel" className="flex shrink-0 items-center rounded-full border border-border bg-surface-muted p-1">
      {([{ value: "light", label: "Claro", Icon: Sun }, { value: "dark", label: "Escuro", Icon: Moon }] as const).map(({ value, label, Icon }) => (
        <button key={value} type="button" disabled={!mounted} aria-label={`Ativar tema ${label.toLowerCase()}`} aria-pressed={mounted && resolvedTheme === value} onClick={() => setTheme(value)}
          className={cn("flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors sm:px-3", mounted && resolvedTheme === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          <Icon className="size-4" aria-hidden /><span className="hidden min-[380px]:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
