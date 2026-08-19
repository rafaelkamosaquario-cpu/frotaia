"use client";

import { useRef, useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, X, Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TypingDots } from "@/components/ui/Loading";
import { cn } from "@/lib/utils";
import { FROTA_NAV_ITEMS } from "./frotaNavItems";

/**
 * Widget "Pergunte ao Frota IA" (Fase 13 do plano de unificação V1+V2) —
 * chat flutuante disponível em qualquer tela do painel /frota, reaproveitando
 * o MESMO motor de IA do WhatsApp (`/api/chat` → `gerarRespostaAssistente`,
 * já usado pelo painel de teste em `/`). Não é uma segunda IA — mesmas
 * tools, mesmo conhecimento, mesmos dados, mesmas permissões.
 *
 * Contexto de página: manda o rótulo da tela atual (ex.: "Manutenção") como
 * bloco de texto avulso (`pageContext`), nunca persistido como mensagem do
 * usuário — só ajuda a IA a entender referências curtas tipo "esse aqui".
 *
 * Upload de imagem: reaproveita o mesmo pipeline de visão que o WhatsApp já
 * usa (`conteudoMultimodal` em gerarRespostaAssistente.ts) — a IA já sabe
 * ler CRLV/nota fiscal/tacógrafo por foto, só faltava um jeito de anexar
 * pelo painel.
 */

const TIPOS_IMAGEM_SUPORTADOS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function lerArquivoComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(arquivo);
  });
}

export function FrotaAiWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mensagens, setMensagens] = useState<WidgetMessage[]>([]);
  const [texto, setTexto] = useState("");
  const [imagemAnexada, setImagemAnexada] = useState<File | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, isLoading]);

  const paginaAtualLabel = FROTA_NAV_ITEMS.find((item) => pathname?.startsWith(item.href))?.label;

  function selecionarImagem(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;
    if (!TIPOS_IMAGEM_SUPORTADOS.has(arquivo.type)) {
      setErro("Formato de imagem não suportado (use JPEG, PNG, GIF ou WebP).");
      return;
    }
    setErro(null);
    setImagemAnexada(arquivo);
  }

  async function enviarMensagem(event: React.FormEvent) {
    event.preventDefault();
    const mensagem = texto.trim();
    if ((!mensagem && !imagemAnexada) || isLoading) return;

    setErro(null);
    setMensagens((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: mensagem || `📎 ${imagemAnexada?.name}` },
    ]);
    setTexto("");
    const arquivoParaEnviar = imagemAnexada;
    setImagemAnexada(null);
    setIsLoading(true);

    try {
      const image = arquivoParaEnviar
        ? { mimeType: arquivoParaEnviar.type, data: await lerArquivoComoBase64(arquivoParaEnviar) }
        : undefined;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: mensagem || "Segue a imagem anexada.",
          pageContext: paginaAtualLabel,
          image,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setErro(data.error ?? "Não foi possível obter resposta agora.");
        return;
      }

      setConversationId(data.conversationId);
      setMensagens((prev) => [...prev, { id: data.message.id, role: "assistant", content: data.message.content }]);
      // A IA pode ter escrito algo (registrar despesa, atualizar veículo etc.) — sincroniza os dados da tela atual (RSC) sem recarregar a página inteira.
      router.refresh();
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

          {imagemAnexada && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <Paperclip className="size-3.5 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{imagemAnexada.name}</span>
              <button type="button" onClick={() => setImagemAnexada(null)} className="text-danger hover:underline" aria-label="Remover anexo">
                Remover
              </button>
            </div>
          )}

          <form onSubmit={enviarMensagem} className="flex items-center gap-2 border-t border-border p-3">
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={selecionarImagem}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isLoading}
              onClick={() => inputArquivoRef.current?.click()}
              aria-label="Anexar foto"
            >
              <Paperclip className="size-4" aria-hidden />
            </Button>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Pergunte algo sobre sua frota…"
              disabled={isLoading}
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" disabled={isLoading || (!texto.trim() && !imagemAnexada)} aria-label="Enviar">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
