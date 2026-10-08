"use client";
import { useEffect, useRef, useState } from "react";
import { groupPurpose, type OperationalGroup } from "@/lib/frota/operationalGroups";
import { GroupObservations } from './GroupObservations';

const field = "mt-1 block w-full rounded-lg border border-border bg-background p-3";
const button = "min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50";
async function api(body?: unknown) {
  const response = await fetch("/api/frota/grupos", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Falha ao consultar os grupos.");
  return result;
}
export function GroupsClient({ companyName }: { companyName: string }) {
  const [groups, setGroups] = useState<OperationalGroup[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(""), [purpose, setPurpose] = useState("abastecimento"), [notes, setNotes] = useState("");
  const draftId = useRef<string | null>(null);
  async function refresh() { const result = await api(); setGroups(result.groups); }
  useEffect(() => { let current = true; api().then(result => { if (current) setGroups(result.groups); }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, []);
  function reset() { setEditing(null); setName(""); setPurpose("abastecimento"); setNotes(""); draftId.current = null; }
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : "Falha de conexão."); } finally { setBusy(false); } }
  return <div className="mx-auto w-full max-w-4xl space-y-5 pb-24">
    <header><h1>Grupos do WhatsApp</h1><p className="mt-2 text-muted-foreground">{companyName} · operação da empresa, separada do Radar de Fretes.</p></header>
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-4"><h2 className="font-semibold">Preparar e acompanhar os grupos</h2><p className="mt-2 text-sm">Cadastre o nome exato e a finalidade. Depois use a seção Leitura silenciosa para vincular o identificador conferido na Z-API.</p><p className="mt-2 text-sm font-medium">Salvar o cadastro não ativa recebimento. A ativação é separada: somente observação no painel, sem respostas nos grupos nem lançamentos automáticos.</p></section>
    {error && <p role="alert" className="rounded-lg border border-red-500 p-3">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-500 p-3">{notice}</p>}
    <form className="space-y-4 rounded-xl border border-border p-5" onSubmit={event => { event.preventDefault(); draftId.current ??= crypto.randomUUID(); run(async () => { await api({ action: "save", id: editing ?? draftId.current, name, purpose, notes }); reset(); await refresh(); setNotice("Grupo salvo para preparação. Cadastro disponível técnica; nenhum recebimento ativado."); }); }}>
      <h2 className="text-lg font-semibold">{editing ? "Editar grupo" : "Adicionar grupo"}</h2>
      <label className="block">Nome exato no WhatsApp<input className={field} value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={100} disabled={busy || loading} /></label>
      <label className="block">Finalidade<select className={field} value={purpose} onChange={e=>setPurpose(e.target.value)} disabled={busy || loading}>{Object.entries(groupPurpose).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block">Observações (opcional)<textarea className={field} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={500} disabled={busy || loading} placeholder="Ex.: tickets de pesagem dos caminhões. Não inclua senhas ou links de convite." /></label>
      <div className="flex gap-3"><button className={`${button} bg-primary text-primary-foreground`} disabled={busy || loading}>{busy ? "Salvando…" : "Salvar grupo"}</button>{editing && <button type="button" className={button} onClick={reset} disabled={busy}>Cancelar edição</button>}</div>
    </form>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Grupos cadastrados</h2><button className={button} disabled={busy || loading} onClick={()=>run(refresh)}>Atualizar lista</button></div>
      {loading ? <p role="status">Carregando grupos…</p> : !groups.length && !error ? <p>Nenhum grupo cadastrado. Adicione cada grupo separadamente acima.</p> : null}
      {groups.map(group=><article key={group.id} className="space-y-2 rounded-xl border border-border p-4"><h3 className="font-semibold break-words">{group.name}</h3><p className="text-sm">{groupPurpose[group.purpose]} · {group.archived ? "Arquivado" : "Cadastro disponível"}</p><p className="text-sm text-muted-foreground">Consulte a ativação e os recebimentos na seção Leitura silenciosa abaixo.</p>{group.notes && <p className="whitespace-pre-wrap break-words text-sm">{group.notes}</p>}<div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>{ setEditing(group.id); setName(group.name); setPurpose(group.purpose); setNotes(group.notes); }}>Editar</button><button className={button} disabled={busy} onClick={()=>run(async()=>{ await api({action:"archive",id:group.id,archived:!group.archived}); if(editing===group.id) reset(); await refresh(); setNotice(group.archived ? "Grupo restaurado para preparação." : "Cadastro arquivado. Nenhum histórico foi apagado."); })}>{group.archived ? "Restaurar" : "Arquivar"}</button></div></article>)}
    </section>
    <GroupObservations groups={groups} />
  </div>;
}
