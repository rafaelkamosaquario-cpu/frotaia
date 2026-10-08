"use client";
import { useEffect, useState } from "react";
import { ALL_MODULE_IDS, COMPANY_MODULES, TIMBER_MODULE_IDS, toggleCompanyModule } from "@/lib/frota/companyModules";
import type { ConsultancyCompany } from "@/lib/frota/consultancy";

export function CompanyModulesEditor({ company, onClose }: { company: ConsultancyCompany; onClose: () => void }) {
  const [enabled, setEnabled] = useState<string[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/consultoria/modulos?companyId=${company.company_id}`, { cache: "no-store", signal: abort.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { setEnabled(data.enabled); setRevision(data.revision); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [company.company_id]);
  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/consultoria/modulos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: company.company_id, enabled, revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRevision(data.revision); setMessage("Módulos salvos para esta empresa. Atualize o painel aberto para carregar o novo menu.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  return <section aria-label={`Módulos de ${company.name}`} className="space-y-4 rounded-xl border border-primary bg-background p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Personalizar painel · {company.name}</h2><p className="mt-2 text-sm text-muted-foreground">Marque os módulos que o cliente usará. A consultoria mantém o acesso completo enquanto seu vínculo estiver ativo.</p></div><button type="button" disabled={busy} onClick={onClose} className="rounded border p-2">Fechar</button></div>
    <p className="text-sm">Visão geral, dados da empresa e configurações básicas permanecem disponíveis. Os resultados financeiros ficam em um conjunto único para manter receitas, despesas, diesel e remunerações coerentes.</p>
    <p className="text-sm text-muted-foreground">Desativar não apaga registros, não altera o plano e não cancela automações já agendadas. Esta configuração controla o painel V2 e suas ferramentas de assistente; o canal WhatsApp V1 e a captura dos grupos são configurados separadamente.</p>
    {busy && revision === null && <p role="status">Carregando configuração…</p>}
    {error && <p role="alert" className="rounded border border-red-500 p-3">{error}</p>}
    {message && <p role="status" className="rounded border border-emerald-500 p-3">{message}</p>}
    {revision !== null && <><div className="flex flex-wrap gap-2">{[["Transporte e carregamento", TIMBER_MODULE_IDS], ["Todos os módulos", ALL_MODULE_IDS], ["Somente o básico", []]] .map(([label, modules]) => <button type="button" key={String(label)} disabled={busy} className="rounded-lg border p-2 text-sm" onClick={() => { setEnabled(modules as string[]); setMessage(""); }}>{String(label)}</button>)}</div>
    <p className="text-xs text-muted-foreground">O financeiro depende de Frota e motoristas: ativar o financeiro inclui esse cadastro; desativar a frota também desativa o financeiro.</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-medium">Módulos liberados ({enabled.length})</legend>{COMPANY_MODULES.map(module => <label key={module.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm"><input type="checkbox" checked={enabled.includes(module.id)} onChange={event => { setMessage(""); setEnabled(current => toggleCompanyModule(current, module.id, event.target.checked)); }} className="size-4" />{module.label}</label>)}</fieldset>
    <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Salvando…" : "Salvar módulos desta empresa"}</button><p className="text-xs text-muted-foreground">A alteração só é aplicada ao clicar em salvar. Empresas sem configuração própria mantêm o acesso anterior.</p></>}
  </section>;
}
