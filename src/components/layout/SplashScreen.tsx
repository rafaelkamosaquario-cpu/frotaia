"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/icons/Logo";
import { cn } from "@/lib/utils";

const SPLASH_VISIBLE_MS = 2000;
const SPLASH_FADE_MS = 300;

type SplashPhase = "visible" | "hiding" | "hidden";

/**
 * Tela de abertura simulada. Placeholder até a identidade visual definitiva
 * (logo, ícone e splash oficiais) ser definida.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<SplashPhase>("visible");

  useEffect(() => {
    const hideTimer = setTimeout(() => setPhase("hiding"), SPLASH_VISIBLE_MS);
    const removeTimer = setTimeout(
      () => setPhase("hidden"),
      SPLASH_VISIBLE_MS + SPLASH_FADE_MS
    );
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden={phase === "hiding"}
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background transition-opacity ease-out",
        phase === "hiding" ? "pointer-events-none opacity-0" : "opacity-100"
      )}
      style={{ transitionDuration: `${SPLASH_FADE_MS}ms` }}
    >
      <div className="flex flex-col items-center gap-4 animate-fade-in-up">
        <LogoMark className="size-14" />
        <div className="text-center">
          <p className="text-lg font-semibold tracking-tight text-foreground">Frota IA</p>
          <p className="mt-1 text-sm text-muted-foreground">Especialista carregando…</p>
        </div>
      </div>
    </div>
  );
}
