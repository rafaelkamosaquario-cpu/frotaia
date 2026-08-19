"use client";

import { useState } from "react";
import Link from "next/link";
import { Newspaper, ClipboardList } from "lucide-react";
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

const ITENS_CHECKLIST: { chave: string; label: string }[] = [
  { chave: "oleo", label: "Óleo" },
  { chave: "agua", label: "Água" },
  { chave: "pneus", label: "Pneus" },
  { chave: "luzes", label: "Luzes" },
];

const HORAS = Array.from({ length: 24 }, (_, h) => h);

export function ConfiguracoesClient({ preferenciasIniciais, podeEditar }: ConfiguracoesClientProps) {
  const { showToast } = useToast();
  const [estilo, setEstilo] = useState(preferenciasIniciais.preferred_response_style ?? "objetivo");
  const [isSaving, setIsSaving] = useState(false);

  const [checklistEnabled, setChecklistEnabled] = useState(preferenciasIniciais.checklist_enabled);
  const [checklistSendHour, setChecklistSendHour] = useState(preferenciasIniciais.checklist_send_hour);
  const [checklistItemKeys, setChecklistItemKeys] = useState<string[]>(preferenciasIniciais.checklist_item_keys);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  async function salvarPreferencias(body: Record<string, unknown>, sucesso: string): Promise<boolean> {
    try {
      const response = await fetch("/api/frota/configuracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        showToast({ title: "Não foi possível alterar", description: data.error ?? "Tente novamente.", variant: "error" });
        return false;
      }

      showToast({ title: sucesso, variant: "success" });
      return true;
    } catch {
      showToast({ title: "Não foi possível alterar", description: "Verifique sua conexão e tente novamente.", variant: "error" });
      return false;
    }
  }

  async function handleSelecionar(novoEstilo: string) {
    if (novoEstilo === estilo || isSaving) return;
    setIsSaving(true);
    const ok = await salvarPreferencias({ preferredResponseStyle: novoEstilo }, "Estilo de resposta atualizado");
    if (ok) setEstilo(novoEstilo);
    setIsSaving(false);
  }

  async function handleToggleChecklist() {
    if (isSavingChecklist) return;
    const novoValor = !checklistEnabled;
    setIsSavingChecklist(true);
    const ok = await salvarPreferencias({ checklistEnabled: novoValor }, novoValor ? "Checklist diário ativado" : "Checklist diário desativado");
    if (ok) setChecklistEnabled(novoValor);
    setIsSavingChecklist(false);
  }

  async function handleHoraChange(novaHora: number) {
    if (novaHora === checklistSendHour || isSavingChecklist) return;
    setIsSavingChecklist(true);
    const ok = await salvarPreferencias({ checklistSendHour: novaHora }, "Horário de envio atualizado");
    if (ok) setChecklistSendHour(novaHora);
    setIsSavingChecklist(false);
  }

  async function handleToggleItem(chave: string) {
    if (isSavingChecklist) return;
    const novosItens = checklistItemKeys.includes(chave)
      ? checklistItemKeys.filter((i) => i !== chave)
      : [...checklistItemKeys, chave];
    if (novosItens.length === 0) {
      showToast({ title: "Deixe pelo menos 1 item ativo", variant: "error" });
      return;
    }
    setIsSavingChecklist(true);
    const ok = await salvarPreferencias({ checklistItemKeys: novosItens }, "Itens do checklist atualizados");
    if (ok) setChecklistItemKeys(novosItens);
    setIsSavingChecklist(false);
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

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ClipboardList className="size-4 text-muted-foreground" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Checklist diário</h2>
                <p className="text-xs text-muted-foreground">Envio automático aos motoristas ativos, todo dia, no horário abaixo.</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={checklistEnabled}
              disabled={!podeEditar || isSavingChecklist}
              onClick={handleToggleChecklist}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                checklistEnabled ? "bg-primary" : "bg-surface-muted"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                  checklistEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>

          {checklistEnabled && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Horário de envio (Brasília)</label>
                <select
                  value={checklistSendHour}
                  disabled={!podeEditar || isSavingChecklist}
                  onChange={(e) => handleHoraChange(Number(e.target.value))}
                  className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {HORAS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Itens do checklist</p>
                <div className="flex flex-wrap gap-2">
                  {ITENS_CHECKLIST.map((item) => {
                    const ativo = checklistItemKeys.includes(item.chave);
                    return (
                      <button
                        key={item.chave}
                        type="button"
                        disabled={!podeEditar || isSavingChecklist}
                        onClick={() => handleToggleItem(item.chave)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          ativo ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-surface-muted"
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
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
