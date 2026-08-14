"use client";

import { useState } from "react";
import { Newspaper } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/hooks/useToast";
import type { CompanyPreferencesRow, NewsDigestRow } from "@/lib/supabase/tables";

interface NoticiasClientProps {
  preferenciasIniciais: CompanyPreferencesRow;
  ultimoResumo: NewsDigestRow | null;
  podeEditar: boolean;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function NoticiasClient({ preferenciasIniciais, ultimoResumo, podeEditar }: NoticiasClientProps) {
  const { showToast } = useToast();
  const [ativado, setAtivado] = useState(preferenciasIniciais.daily_news_enabled);
  const [isSaving, setIsSaving] = useState(false);

  async function handleToggle() {
    const proximoValor = !ativado;
    setIsSaving(true);
    try {
      const response = await fetch("/api/frota/noticias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyNewsEnabled: proximoValor }),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível alterar", description: data.error ?? "Tente novamente.", variant: "error" });
        return;
      }

      setAtivado(proximoValor);
      showToast({ title: proximoValor ? "Resumo diário ativado" : "Resumo diário desativado", variant: "success" });
    } catch {
      showToast({ title: "Não foi possível alterar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Notícias do setor</h1>
        <p className="text-sm text-muted-foreground">Resumo diário gerado a partir de fontes oficiais e imprensa especializada do transporte</p>
      </div>

      <Card className="mb-4 flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Receber resumo diário pelo WhatsApp</p>
          <p className="text-xs text-muted-foreground">
            {podeEditar ? "Um resumo curto todo dia, opt-in — desativado por padrão." : "Só o dono/administrador da empresa pode alterar essa preferência."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ativado}
          disabled={!podeEditar || isSaving}
          onClick={handleToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${ativado ? "bg-primary" : "bg-surface-muted"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${ativado ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </Card>

      {ultimoResumo ? (
        <Card className="p-4">
          <p className="mb-2 text-xs text-muted-foreground">Último resumo gerado em {formatDateTime(ultimoResumo.generated_at)}</p>
          <p className="whitespace-pre-line text-sm text-foreground">{ultimoResumo.content}</p>
        </Card>
      ) : (
        <Card className="p-2">
          <EmptyState
            icon={Newspaper}
            title="Nenhum resumo gerado ainda"
            description="O resumo diário é gerado quando pelo menos uma empresa está com o recurso ativado — o próximo aparece aqui assim que rodar."
          />
        </Card>
      )}
    </div>
  );
}
