"use client";

import { useRef, useState, useEffect } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";

/**
 * Widget "Pergunte ao Frota IA" (Fase 13 do plano de unificação V1+V2) —
 * chat flutuante disponível em qualquer tela do painel /frota, reaproveitando
 * o MESMO motor de IA do WhatsApp (`/api/chat` → `gerarRespostaAssistente`,
 * já usado pelo painel de teste em `/`). Não é uma segunda IA — mesmas
 * tools, mesmo conhecimento, mesmos dados, mesmas permissões.
 *
 * Contexto da página atual (ex.: "você está em Manutenção") NÃO é
 * repassado ainda — a IA responde com base nos dados da empresa via as
 * mesmas ferramentas que já usa no WhatsApp (gerenciar_manutencao,
 * registrar_despesa etc.), então perguntas como "qual veículo tem mais
 * pendência" já funcionam sem precisar saber em qual tela o usuário está.
 * Passar contexto de página de forma estruturada fica pra uma iteração
 * futura, deliberadamente fora desta fase.
 */

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function FrotaAiWidget() {
  const [open, setOpen] = useState(false);
  const [mensagens, setMensagens] = useState<WidgetMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, isLoading]);

  async function enviarMensagem(event: React.FormEvent) {
    event.preventDefault();
    const mensagem = texto.trim();
    if (!mensagem || isLoading) return;

    setErro(null);
    setMensagens((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: mensagem }]);
    setTexto("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: mensagem }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error ?? "Não foi possível obter resposta agora.");
        return;
      }

      setConversationId(data.conversationId);
      setMensagens((prev) => [...prev, { id: data.message.id, role: "assistant", content: data.message.content }]);
    } catch {
      setErro("Verifique sua conexão e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar o Frota IA" : "Pergunte ao Frota IA"}
        className="fixed bottom-5 right-5 z-40 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      </button>

      {open && (
        <div className="fixed bottom-22 right-5 z-40 flex h-[min(560px,70dvh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Pergunte ao Frota IA</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
            {mensagens.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Pergunte qualquer coisa sobre a frota — ex.: &ldquo;qual veículo está com mais pendência?&rdquo; ou &ldquo;quanto gastei em combustível esse mês?&rdquo;
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 text-sm",
                      m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-surface-muted text-foreground"
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {isLoading && (
                  <div className="self-start rounded-lg bg-surface-muted px-3 py-2">
                    <TypingDots />
                  </div>
                )}
              </div>
            )}
            {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}
            <div ref={fimDaListaRef} />
          </div>

          <form onSubmit={enviarMensagem} className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pergunte algo sobre sua frota…"
              disabled={isLoading}
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" disabled={isLoading || !texto.trim()} aria-label="Enviar">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
