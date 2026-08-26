"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CONTEXTUAL_HELP_CONTENT, type ContextualHelpTopic } from "@/lib/frota/contextualHelpContent";
import { askFrotaAiWidget } from "./frotaAiWidgetBus";

/**
 * Ajuda contextual leve por tela (08/2026) — botão discreto "?" que abre um
 * texto curto + exemplo + atalho pra perguntar ao Frota IA (widget já
 * existente, nunca um chat novo). Reaproveita `Modal.tsx` (mesmo
 * comportamento de mobile-sheet/desktop-dialog já usado em todo o painel).
 */

interface ContextualHelpProps {
  topic: ContextualHelpTopic;
}

export function ContextualHelp({ topic }: ContextualHelpProps) {
  const [open, setOpen] = useState(false);
  const conteudo = CONTEXTUAL_HELP_CONTENT[topic];

  function perguntarAIA() {
    askFrotaAiWidget(conteudo.perguntaParaIA);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Como funciona esta tela"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      >
        <HelpCircle className="size-4" aria-hidden />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={conteudo.titulo} className="sm:max-w-sm">
        <p className="mb-3 text-sm text-muted-foreground">{conteudo.texto}</p>
        <p className="mb-4 rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground">&ldquo;{conteudo.exemplo}&rdquo;</p>
        <Button onClick={perguntarAIA} className="w-full">
          Perguntar ao Frota IA
        </Button>
      </Modal>
    </>
  );
}
