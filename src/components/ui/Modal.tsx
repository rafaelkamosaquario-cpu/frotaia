"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHasMounted } from "@/hooks/useHasMounted";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, className, children }: ModalProps) {
  const hasMounted = useHasMounted();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !hasMounted) return null;

  return createPortal(
    // No mobile vira sheet de tela cheia (mais espaço/toque pra formulário longo); a partir de `sm` volta a ser o modal centralizado de sempre.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in-up"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "frota-safe-bottom animate-fade-in-up relative flex max-h-[92dvh] w-full flex-col overflow-y-auto scrollbar-thin rounded-t-2xl border border-border bg-surface p-6 shadow-xl sm:max-w-md sm:rounded-2xl",
          className
        )}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="size-4.5" aria-hidden />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
