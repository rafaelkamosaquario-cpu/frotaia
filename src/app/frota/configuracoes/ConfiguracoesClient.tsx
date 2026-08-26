"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Newspaper, ClipboardList, BrainCircuit, Compass } from "lucide-react";
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
  const router = useRouter();
  const [estilo, setEstilo] = useState(preferenciasIniciais.preferred_response_style ?? "objetivo");
  const [isSaving, setIsSaving] = useState(false);
  const [isReabrindoGuia, setIsReabrindoGuia] = useState(false);

  /** Guia de Primeiros Passos V2 (08/2026) — reabertura manual (seção 21: "não mostrar novamente" nunca esconde essa opção). Vai direto pro tour (não pro convite), pois é um pedido explícito. */
  async function reabrirGuia() {
    setIsReabrindoGuia(true);
    try {
      await fetch("/api/frota/guide-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", step: "dashboard" }),
      });
      router.push("/frota/dashboard");
    } catch {
      showToast({ title: "Não foi possível abrir o guia agora", description: "Verifique sua conexão e tente de novo.", variant: "error" });
      setIsReabrindoGuia(false);
    }
  }

  const [checklistEnabled, setChecklistEnabled] = useState(preferenciasIniciais.checklist_enabled);
  const [checklistSendHour, setChecklistSendHour] = useState(preferenciasIniciais.checklist_send_hour);
  const [checklistItemKeys, setChecklistItemKeys] = useState<string[]>(preferenciasIniciais.checklist_item_keys);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  const [askBeforeSavingMemory, setAskBeforeSavingMemory] = useState(preferenciasIniciais.ask_before_saving_memory);
  const [allowAutomaticMemory, setAllowAutomaticMemory] = useState(preferenciasIniciais.allow_automatic_memory);
  const [isSavingMemoria, setIsSavingMemoria] = useState(false);

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

  async function handleToggleAskBefore() {
    if (isSavingMemoria) return;
    const novoValor = !askBeforeSavingMemory;
    setIsSavingMemoria(true);
    const ok = await salvarPreferencias(
      { askBeforeSavingMemory: novoValor },
      novoValor ? "Agora o Frota IA sempre confirma antes de guardar algo" : "Confirmação antes de guardar desativada"
    );
    if (ok) setAskBeforeSavingMemory(novoValor);
    setIsSavingMemoria(false);
  }

  async function handleToggleAllowAutomatic() {
    if (isSavingMemoria) return;
    const novoValor = !allowAutomaticMemory;
    setIsSavingMemoria(true);
    const ok = await salvarPreferencias(
      { allowAutomaticMemory: novoValor },
      novoValor ? "Frota IA pode guardar informações sozinho" : "Frota IA agora só guarda informação com sua confirmação"
    );
    if (ok) setAllowAutomaticMemory(novoValor);
    setIsSavingMemoria(false);
  }

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências da empresa no Frota IA</p>
      </div>

      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IA</p>

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
          <div className="mb-3 flex items-center gap-3">
            <BrainCircuit className="size-4 text-muted-foreground" aria-hidden />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Memória do Frota IA</h2>
              <p className="text-xs text-muted-foreground">Permite que o Frota IA lembre informações úteis da sua operação entre conversas.</p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-foreground">Perguntar antes de guardar</p>
                <p className="text-xs text-muted-foreground">O Frota IA sempre confirma com você antes de salvar algo novo.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={askBeforeSavingMemory}
                disabled={!podeEditar || isSavingMemoria}
                onClick={handleToggleAskBefore}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  askBeforeSavingMemory ? "bg-primary" : "bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                    askBeforeSavingMemory ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-foreground">Guardar automaticamente</p>
                <p className="text-xs text-muted-foreground">
                  {allowAutomaticMemory
                    ? "O Frota IA pode guardar informações sozinho, quando fizer sentido."
                    : "Desativado — o Frota IA só guarda algo depois que você confirmar explicitamente."}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowAutomaticMemory}
                disabled={!podeEditar || isSavingMemoria}
                onClick={handleToggleAllowAutomatic}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  allowAutomaticMemory ? "bg-primary" : "bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
                    allowAutomaticMemory ? "translate-x-[22px]" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          </div>
        </Card>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Automação</p>

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

        <Card className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <Compass className="size-4 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Guia de primeiros passos</p>
              <p className="text-xs text-muted-foreground">Reveja o tour rápido pelo painel sempre que quiser.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={reabrirGuia}
            disabled={isReabrindoGuia}
            className="text-sm font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Abrir
          </button>
        </Card>
      </div>
    </div>
  );
}
