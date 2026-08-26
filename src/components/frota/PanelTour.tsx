"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { X, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useHasMounted } from "@/hooks/useHasMounted";
import {
  PANEL_TOUR_STEP_DEFS,
  PANEL_TOUR_STEPS,
  proximoPassoTourV2,
  passoAnteriorTourV2,
  progressoTourV2,
  type PanelTourStep,
  type PanelTourStepDef,
} from "@/lib/frota/panelTourSteps";
import type { GuideStatus } from "@/services/supabase/companyPreferencesService";

/**
 * Tour visual do Painel (V2/Gestão), 08/2026 — sem biblioteca nova (nenhum
 * Radix/floating-ui no projeto, ver auditoria da spec): overlay/spotlight
 * hand-rolled, mesmo padrão de portal + useHasMounted já usado em
 * Modal.tsx/FrotaMobileSidebar.tsx.
 *
 * Decisão de design: o CARTÃO explicativo fica numa posição FIXA (rodapé em
 * mobile, canto inferior direito em desktop — mesma linguagem visual do
 * Modal.tsx: sheet no mobile, card ancorado no desktop), nunca ancorado no
 * elemento-alvo. Só o SPOTLIGHT (anel + escurecimento ao redor) segue o
 * alvo. Isso evita qualquer cálculo de posicionamento por passo — o cartão
 * nunca fica fora da viewport, atrás da bottom nav ou sobreposto ao
 * teclado, porque a posição é sempre a mesma, testada uma vez.
 *
 * Mobile: só 4 destinos + "Mais" existem na DOM (FrotaBottomNav) — quando
 * o alvo real (ex.: Manutenção) está escondido atrás do drawer "Mais",
 * aponta pro botão "Mais" com o mesmo texto (o usuário toca lá pra achar).
 * Elemento ausente (ex.: card "Frota IA sugere" quando insight é nulo, ou
 * navegação pra fora do dashboard em pleno tour) nunca quebra a
 * aplicação — o passo é pulado automaticamente.
 */

const DASHBOARD_HREF = "/frota/dashboard";

interface GuideStateResponse {
  status: GuideStatus;
  step: string | null;
  offeredAt: string | null;
}

async function fetchGuideState(): Promise<GuideStateResponse | null> {
  try {
    const res = await fetch("/api/frota/guide-v2");
    if (!res.ok) return null;
    return (await res.json()) as GuideStateResponse;
  } catch {
    return null;
  }
}

function persistGuideState(status: GuideStatus, step: string | null, markOffered = false): void {
  fetch("/api/frota/guide-v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, step, markOffered }),
  }).catch(() => {
    // Best-effort: nunca trava a experiência do tour por causa de falha de rede/gravação.
  });
}

function resolveTarget(target: PanelTourStepDef["target"]): { el: HTMLElement; viaFallbackMais: boolean } | null {
  if (target.kind === "none") return null;
  if (target.kind === "data") {
    const el = document.querySelector<HTMLElement>(`[data-tour="${target.key}"]`);
    return el ? { el, viaFallbackMais: false } : null;
  }
  const direto = document.querySelector<HTMLElement>(`[data-tour-href="${target.href}"]`);
  if (direto) return { el: direto, viaFallbackMais: false };
  // Mobile: item pode estar escondido dentro do drawer "Mais" (só os 4 destinos primários ficam na bottom nav).
  const botaoMais = document.querySelector<HTMLElement>("[data-tour-more-button]");
  return botaoMais ? { el: botaoMais, viaFallbackMais: true } : null;
}

type TourMode = "idle" | "invite" | "active";

export function PanelTour() {
  const pathname = usePathname();
  const hasMounted = useHasMounted();
  const [mode, setMode] = useState<TourMode>("idle");
  const [step, setStep] = useState<PanelTourStep>(PANEL_TOUR_STEPS[0]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [viaFallbackMais, setViaFallbackMais] = useState(false);

  // Refaz a consulta toda vez que o usuário CHEGA no dashboard (não só na
  // primeira vez) — necessário pra "reabrir o guia" a partir de
  // Configurações funcionar: aquela ação muda o estado no servidor e manda
  // o usuário de volta pro dashboard, e este efeito precisa notar a
  // mudança. Também é o que faz o tour "retomável" de verdade: se o
  // usuário navegar pra outro módulo no meio do tour e voltar, ele
  // continua de onde parou.
  useEffect(() => {
    if (pathname !== DASHBOARD_HREF) return;
    fetchGuideState().then((estado) => {
      if (!estado) return;
      if (estado.status === "in_progress" && estado.step) {
        setStep(estado.step as PanelTourStep);
        setMode("active");
      } else if (estado.status === "not_started" && !estado.offeredAt) {
        setMode("invite");
        persistGuideState("not_started", null, true);
      }
    });
  }, [pathname]);

  useEffect(() => {
    if (mode !== "active") return;
    const def = PANEL_TOUR_STEP_DEFS[step];
    // Passo sem alvo (conclusão): nada pra medir — o valor exibido é derivado
    // na renderização (`rectExibido` abaixo), não precisa de setState aqui.
    if (def.target.kind === "none") return;

    const medir = () => {
      const alvo = resolveTarget(def.target);
      if (!alvo) {
        // Elemento ausente (insight nulo, ou navegou pra fora do dashboard) — nunca quebra, só pula pro próximo passo resolvível.
        const proximo = proximoPassoTourV2(step);
        if (proximo) setStep(proximo);
        else setMode("idle");
        return;
      }
      setViaFallbackMais(alvo.viaFallbackMais);
      setRect(alvo.el.getBoundingClientRect());
    };

    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const intervalo = window.setInterval(medir, 400); // layout pode mudar (RSC refresh, dados chegando) sem disparar resize/scroll
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      window.clearInterval(intervalo);
    };
  }, [mode, step]);

  const sair = useCallback(() => {
    setMode("idle");
    persistGuideState("dismissed", step);
  }, [step]);

  useEffect(() => {
    if (mode !== "active") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") sair();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mode, sair]);

  function iniciar() {
    setMode("active");
    setStep(PANEL_TOUR_STEPS[0]);
    persistGuideState("in_progress", PANEL_TOUR_STEPS[0]);
  }

  function agoraNao() {
    setMode("idle");
    persistGuideState("not_started", null);
  }

  function naoMostrarNovamente() {
    setMode("idle");
    persistGuideState("dismissed", null);
  }

  function avancar() {
    const proximo = proximoPassoTourV2(step);
    if (!proximo) {
      setMode("idle");
      persistGuideState("completed", null);
      return;
    }
    setStep(proximo);
    persistGuideState("in_progress", proximo);
  }

  function voltar() {
    const anterior = passoAnteriorTourV2(step);
    if (!anterior) return;
    setStep(anterior);
    persistGuideState("in_progress", anterior);
  }

  if (!hasMounted || pathname !== DASHBOARD_HREF || mode === "idle") return null;

  const def = PANEL_TOUR_STEP_DEFS[step];
  const rectExibido = def.target.kind === "none" ? null : rect;

  return createPortal(
    <>
      {mode === "invite" && <InviteCard onStart={iniciar} onLater={agoraNao} onNever={naoMostrarNovamente} />}
      {mode === "active" && (
        <>
          <div className="fixed inset-0 z-[60]" aria-hidden onClick={sair}>
            {rectExibido && (
              <div
                className="pointer-events-none fixed rounded-lg ring-2 ring-primary transition-all duration-200"
                style={{
                  top: rectExibido.top - 6,
                  left: rectExibido.left - 6,
                  width: rectExibido.width + 12,
                  height: rectExibido.height + 12,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                }}
              />
            )}
            {!rectExibido && <div className="absolute inset-0 bg-black/55" />}
          </div>
          <StepCard
            def={def}
            viaFallbackMais={def.target.kind === "none" ? false : viaFallbackMais}
            onNext={avancar}
            onBack={passoAnteriorTourV2(step) ? voltar : undefined}
            onExit={sair}
          />
        </>
      )}
    </>,
    document.body
  );
}

function TourCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="frota-safe-bottom fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:p-0">
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-2xl sm:max-w-xs">
        {children}
      </div>
    </div>
  );
}

function InviteCard({ onStart, onLater, onNever }: { onStart: () => void; onLater: () => void; onNever: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" aria-hidden onClick={onLater} />
      <TourCardShell>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Conheça o Frota IA Gestão</h2>
          <button type="button" onClick={onLater} aria-label="Fechar" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Quer fazer um tour rápido pelo painel (8 passos, menos de 2 minutos)?</p>
        <div className="flex flex-col gap-2">
          <Button onClick={onStart} className="w-full">
            Iniciar guia
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onLater} className="flex-1">
              Agora não
            </Button>
            <Button variant="ghost" size="sm" onClick={onNever} className="flex-1">
              Não mostrar novamente
            </Button>
          </div>
        </div>
      </TourCardShell>
    </>
  );
}

interface StepCardProps {
  def: PanelTourStepDef;
  viaFallbackMais: boolean;
  onNext: () => void;
  onBack?: () => void;
  onExit: () => void;
}

function StepCard({ def, viaFallbackMais, onNext, onBack, onExit }: StepCardProps) {
  const ehConclusao = def.step === "conclusao";
  const texto = viaFallbackMais ? `${def.texto} Toque em "Mais" pra encontrar.` : def.texto;

  return (
    <TourCardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{progressoTourV2(def.step)}</span>
        <button type="button" onClick={onExit} aria-label="Fechar o tour" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <h2 className="mb-1.5 text-sm font-semibold text-foreground">{def.titulo}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{texto}</p>
      <div className="flex items-center gap-2">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Passo anterior">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        )}
        {!ehConclusao && (
          <Button variant="ghost" size="sm" onClick={onExit} className="flex-1">
            Sair
          </Button>
        )}
        <Button size="sm" onClick={onNext} className="flex-1">
          {ehConclusao ? "Concluir" : "Próximo"}
        </Button>
      </div>
    </TourCardShell>
  );
}
