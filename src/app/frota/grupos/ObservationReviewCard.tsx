"use client";
import { useState } from "react";
import Link from "next/link";
import type { GroupObservation } from "@/lib/frota/groupObservation";
import { observationStage, type ReviewRecord } from "@/lib/frota/groupReview";

export function ObservationReviewCard({ event, groupName, onSaved, previewRecords }: { event: GroupObservation; groupName: string; onSaved: () => Promise<void>; previewRecords?: ReviewRecord[] }) {
  const [records, setRecords] = useState<ReviewRecord[] | null>(null);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stage = observationStage(event);
  const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50";
  async function load() {
    if (previewRecords) { setRecords(previewRecords); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/frota/grupos/revisao", { cache: "no-store" }), data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setRecords(data.records);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível consultar."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (previewRecords) return;
    const record = records?.find(r => `${r.type}:${r.id}` === selected);
    if (!record || !confirmed) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/frota/grupos/revisao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observationId: event.id, recordType: record.type, recordId: record.id, note, confirmed }) }), data = await r.json();
      if (!r.ok) throw new Error(data.error);
      await onSaved(); setRecords(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar."); }
    finally { setBusy(false); }
  }
  return <article className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold">{groupName}</h3><p className="text-xs text-muted-foreground">{new Date(event.received_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {event.sender_name} · {event.kind}</p></div><span className={stage.tone === "success" ? "text-sm text-success" : "text-sm text-muted-foreground"}>{stage.label}</span></div>
    <ol aria-label="Etapas da conferência" className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">{["Recebido", "Interpretado", "Conferência", "Registrado"].map((label, i) => <li key={label} aria-current={i === stage.index ? "step" : undefined} className={`rounded-lg border p-2 ${i === stage.index ? "border-primary bg-primary/10 font-semibold" : "border-border text-muted-foreground"}`}>{i + 1}. {label}</li>)}</ol>
    <p className="whitespace-pre-wrap break-words text-sm">{event.status === "processing" ? "Interpretação pendente. Confira o original se a leitura não avançar." : event.summary}</p>
    {event.original_text && <details><summary className="cursor-pointer text-sm">Mensagem original</summary><p className="whitespace-pre-wrap break-words text-sm">{event.original_text}</p></details>}
    {event.status === "review" && <details><summary className="cursor-pointer text-sm">Dados identificados e dúvidas</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.evidence, null, 2)}</pre></details>}
    {stage.index === 3 ? <div className="text-sm"><p>Conferido em {event.reviewed_at ? new Date(event.reviewed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "data não informada"}. {event.review_note}</p><Link className="underline" href={event.fuel_fillup_id ? "/frota/abastecimentos" : "/frota/receitas"}>Consultar lançamento {event.fuel_fillup_id || event.revenue_id}</Link><p className="mt-1 text-xs text-muted-foreground">Vínculo de conferência. Nenhum valor foi somado novamente.</p></div> : <>
      <p className="text-xs text-muted-foreground">Confira o anexo original no WhatsApp. Para registrar, use Abastecimentos ou Receitas e depois vincule o lançamento abaixo. Não vincule um total mensal a um ticket individual.</p>
      <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" href="/frota/abastecimentos">Abrir abastecimentos</Link><Link className="underline" href="/frota/receitas">Abrir receitas</Link></div>
      <button className={button} disabled={busy || event.status === "processing"} onClick={load}>{busy ? "Consultando…" : "Conferir e vincular lançamento"}</button>
      {records && <div className="space-y-3 rounded-lg border border-border p-3">
        <label className="block text-sm">Lançamento da mesma empresa<select className="mt-1 min-h-11 w-full rounded border border-border bg-surface p-2" value={selected} onChange={e => { setSelected(e.target.value); setConfirmed(false); }}><option value="">Selecione após conferir o original</option>{records.map(r => <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>{r.type === "fuel" ? "Abastecimento" : "Receita"} · {r.label}</option>)}</select></label>
        <p className="text-xs text-muted-foreground">Até 100 registros recentes de cada tipo. Se não encontrar, confira o cadastro; não crie uma segunda cópia.</p>
        <label className="block text-sm">Observação da conferência<textarea maxLength={500} className="mt-1 w-full rounded border border-border bg-surface p-2" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: conferi placa, data, litros e valor no comprovante." /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Conferi o original e este lançamento corresponde a esta mensagem.</label>
        <button className={button} disabled={!!previewRecords || busy || !selected || !confirmed || note.trim().length < 5} onClick={save}>{previewRecords ? "Prévia — gravação desativada" : "Confirmar vínculo — sem duplicar valores"}</button>
      </div>}
    </>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <p className="text-xs text-muted-foreground">Sem respostas ao grupo. Leitura não é confirmação de lançamento.</p>
  </article>;
}
