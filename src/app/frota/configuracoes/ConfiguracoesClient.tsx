"use client";

import { useState } from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { CompanyPreferencesRow } from "@/lib/supabase/tables";

interface ConfiguracoesClientProps {
  preferenciasIniciais: CompanyPreferencesRow;
  podeEditar: boolean;
}

const ESTILOS: { valor: string; label: string; descricao: string }[] = [
  { valor: "simples", label: "Simples", descricao: "Linguagem direta, sem jargão técnico." },
  { valor: "tecnico", label: "Técnico", descricao: "Terminologia precisa e detalhamento completo." },
  { valor: "objetivo", label: "Objetivo", descricao: "Padrão — direto, sem ser nem simples nem técnico." },
];

export function ConfiguracoesClient({ preferenciasIniciais, podeEditar }: ConfiguracoesClientProps) {
  const { showToast } = useToast();
  const [estilo, setEstilo] = useState(preferenciasIniciais.preferred_response_style ?? "objetivo");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSelecionar(novoEstilo: string) {
    if (novoEstilo === estilo || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch("/api/frota/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredResponseStyle: novoEstilo }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível alterar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      setEstilo(novoEstilo);
      showToast({ title: "Estilo de resposta atualizado", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível alterar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências da empresa no Frota IA</p>
      </div>

      <div className="flex max-w-xl flex-col gap-4">
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Estilo de resposta da IA</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Muda só a forma de explicar — os números calculados são sempre os mesmos, vale tanto no WhatsApp quanto no chat do painel.
            {!podeEditar && " Só o dono/administrador da empresa pode alterar."}
          </p>
          <div className="flex flex-col gap-2">
            {ESTILOS.map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                disabled={!podeEditar || isSaving}
                onClick={() => handleSelecionar(opcao.valor)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  estilo === opcao.valor ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    estilo === opcao.valor ? "border-primary" : "border-border"
                  )}
                >
                  {estilo === opcao.valor && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-foreground">{opcao.label}</span>
                  <span className="block text-xs text-muted-foreground">{opcao.descricao}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <Newspaper className="size-4 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Notícias do setor</p>
              <p className="text-xs text-muted-foreground">Resumo diário e ativação ficam numa tela própria.</p>
            </div>
          </div>
          <Link href="/frota/noticias" className="text-sm font-medium text-primary hover:underline">
            Abrir
          </Link>
        </Card>
      </div>
    </div>
  );
}
