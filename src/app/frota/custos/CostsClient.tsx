"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Wallet, Users, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { calculateCost, categories, methods, costRuleSchema, type CostRule, type CostRuleRow, type CostEntry, type CostOperation } from "@/lib/frota/costs";

type Option = { id: string; name: string };
type Data = { operations: CostOperation[]; rules: CostRuleRow[]; entries: CostEntry[] };
const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const control = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground";
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1.5 text-sm font-medium">{label}{children}</label>; }
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const blank = (month: string): CostRule => ({ name: "", category: "salario", person: "", driverId: null, vehicleId: null, method: "fixed", fixed: 0, rate: 0, unit: "tonelada", basis: "realizado", startMonth: month, endMonth: null, dueDay: 5, allocations: [] });

export function CostsClient({ drivers, vehicles }: { drivers: Option[]; vehicles: Option[] }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [data, setData] = useState<Data>({ operations: [], rules: [], entries: [] });
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [tab, setTab] = useState("entries");
  const [editor, setEditor] = useState<CostRule | null>(null); const [editId, setEditId] = useState<string>();
  const [opName, setOpName] = useState(""); const [opOpen, setOpOpen] = useState(false);
  const [generate, setGenerate] = useState<CostRuleRow | null>(null); const [base, setBase] = useState(""); const [note, setNote] = useState("");
  const [confirmEntry, setConfirmEntry] = useState<CostEntry | null>(null); const [payEntry, setPayEntry] = useState<CostEntry | null>(null);
  const [paidDate, setPaidDate] = useState(today); const [discard, setDiscard] = useState<CostEntry | null>(null);
  const [operationFilter, setOperationFilter] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/frota/custos?month=${month}`, { signal: abort.signal }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })
      .then(d => { if (!abort.signal.aborted) setData(d); }).catch(e => { if (!abort.signal.aborted) setError(e.message || "Falha ao carregar."); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [month]);
  async function action(payload: unknown, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/frota/custos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await r.json(); if (!r.ok) throw new Error(result.error);
      const refreshed = await fetch(`/api/frota/custos?month=${month}`); const d = await refreshed.json();
      if (!refreshed.ok) throw new Error("A ação foi salva, mas a lista não atualizou. Recarregue antes de repetir.");
      setData(d); setNotice(success); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); return false; } finally { setBusy(false); }
  }
  function update<K extends keyof CostRule>(key: K, value: CostRule[K]) { setEditor(old => old ? { ...old, [key]: value } : old); }
  async function saveRule(e: FormEvent) {
    e.preventDefault(); const parsed = costRuleSchema.safeParse(editor);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (await action({ action: "rule", id: editId, definition: parsed.data }, "Cadastro salvo. Os lançamentos anteriores não foram alterados.")) setEditor(null);
  }
  const entries = data.entries.filter(e => !operationFilter || e.snapshot.calculation.allocations.some(a => a.operationId === operationFilter));
  const amountOf = (e: CostEntry) => operationFilter ? e.snapshot.calculation.allocations.find(a => a.operationId === operationFilter)?.amount ?? 0 : e.amount;
  const total = (rows: CostEntry[]) => rows.reduce((s, e) => s + amountOf(e), 0);
  const draftTotal = total(entries.filter(e => !e.expense_id)); const confirmedTotal = total(entries.filter(e => e.expense_id));
  const paidTotal = total(entries.filter(e => e.paid_on));
  let preview: ReturnType<typeof calculateCost> | null = null;
  if (generate) { try { preview = calculateCost(generate.definition, month, Number(base)); } catch { /* Form explains missing inputs. */ } }
  const errorBox = error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>;
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1>Custos e remunerações</h1><p className="mt-1 text-sm text-muted-foreground">Custos fixos, salários e comissões. Do caminhão à operação completa.</p></div>
      <Button disabled={loading || busy} onClick={() => { setEditId(undefined); setEditor(blank(month)); setError(""); }}><Plus className="mr-2 size-4" />Novo cadastro</Button></header>
    {!editor && !generate && !opOpen && !confirmEntry && !payEntry && !discard && errorBox}
    {notice && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{notice}</p>}
    <Card className="flex flex-wrap items-end gap-4 p-4"><Field label="Mês de referência"><input className={control} type="month" min="2000-01" max="2099-12" value={month} disabled={busy} onChange={e => { if (e.target.value && e.target.value !== month) { setLoading(true); setError(""); setNotice(""); setData({ operations: [], rules: [], entries: [] }); setMonth(e.target.value); } }} /></Field>
      <Field label="Operação (opcional)"><select className={control} value={operationFilter} onChange={e => setOperationFilter(e.target.value)}><option value="">Todas / geral</option>{data.operations.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}</select></Field>
      <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">Controle gerencial, não folha trabalhista. As comissões usam a base que você informar e conferir; não são extraídas automaticamente dos fretes.</p></Card>
    <div className="grid gap-3 sm:grid-cols-3">{[["A conferir", draftTotal, Wallet], ["Confirmado em Despesas", confirmedTotal, Layers3], ["Marcado como pago", paidTotal, Users]].map(([label, value, Icon]) => { const Glyph = Icon as typeof Wallet; return <Card key={String(label)} className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Glyph className="size-5" />{String(label)}</div><p className="mt-2 text-2xl font-semibold">{BRL(Number(value))}</p></Card>; })}</div>
    <p className="text-xs text-muted-foreground">Pago é parte do confirmado, não um custo adicional. Valores por competência mensal; não compare um salário inteiro com receita de poucos dias.</p>
    <nav aria-label="Seções de custos" className="flex flex-wrap gap-2">{[["entries", "Lançamentos do mês"], ["rules", "Cadastros recorrentes"], ["operations", "Operações"]].map(([id,label]) => <Button key={id} variant={tab === id ? "primary" : "outline"} onClick={() => setTab(id)}>{label}</Button>)}</nav>
    {loading ? <p role="status">Carregando custos…</p> : tab === "entries" ? <div className="space-y-3">
      {!entries.length && <Card className="p-8 text-center"><h2 className="font-semibold">Nenhum custo gerado neste mês</h2><p className="mt-2 text-sm text-muted-foreground">Cadastre uma regra e use “Gerar mês”. Confira o valor antes de incluí-lo em Despesas.</p><Button variant="outline" className="mt-4" onClick={() => setTab("rules")}>Ver cadastros recorrentes</Button></Card>}
      {entries.map(e => <Card key={e.id} className="space-y-3 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold">{e.snapshot.name}</h2><p className="text-sm text-muted-foreground">{e.snapshot.person || "Custo da empresa"} · {categories[e.snapshot.category]} · vence {e.due_date.split("-").reverse().join("/")}</p></div><div className="text-right"><p className="text-xl font-semibold">{BRL(amountOf(e))}</p><p className="text-xs text-muted-foreground">{e.paid_on ? `Pago em ${e.paid_on.split("-").reverse().join("/")}` : e.expense_id ? "Confirmado · pagamento pendente" : "A conferir · fora de Despesas"}</p></div></div>
        <p className="text-sm">Fixo: {BRL(e.snapshot.calculation.fixed)} · Variável: {BRL(e.snapshot.calculation.variable)}{e.snapshot.method !== "fixed" && ` · Base: ${e.snapshot.base.toLocaleString("pt-BR")} ${e.snapshot.method.includes("percent") ? "reais" : e.snapshot.unit}`}</p>
        {e.snapshot.note && <p className="whitespace-pre-wrap text-sm text-muted-foreground">Origem da base: {e.snapshot.note}</p>}
        <p className="text-sm text-muted-foreground">{e.snapshot.calculation.allocations.length ? e.snapshot.calculation.allocations.map(a => `${e.snapshot.operationNames[a.operationId]}: ${a.percent}% (${BRL(a.amount)})`).join(" · ") : "Geral — sem divisão por operação"}</p>
        <div className="flex flex-wrap gap-2">{!e.expense_id ? <><Button disabled={busy} onClick={() => setConfirmEntry(e)}>Conferir e confirmar despesa</Button><Button variant="outline" disabled={busy} onClick={() => setDiscard(e)}>Descartar rascunho</Button></> : !e.paid_on ? <Button variant="outline" disabled={busy} onClick={() => { setPayEntry(e); setPaidDate(today()); }}>Registrar pagamento realizado</Button> : null}<Link className="px-2 py-2 text-sm text-primary" href="/frota/despesas">Ver Despesas</Link></div></Card>)}
    </div> : tab === "rules" ? <div className="space-y-3"><p className="text-sm text-muted-foreground">A regra se repete por mês, mas o lançamento só é criado quando você usa “Gerar mês”. Alterações não recalculam meses já gerados.</p>
      {!data.rules.length && <Card className="p-6">Use “Novo cadastro” para adicionar seu primeiro custo ou remuneração.</Card>}
      {data.rules.map(r => <Card key={r.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="font-semibold">{r.definition.name}{!r.active && " · Arquivado"}</h2><p className="text-sm text-muted-foreground">{r.definition.person} · {methods[r.definition.method]}{r.definition.method.includes("fixed") && ` · ${BRL(r.definition.fixed)}`}{r.definition.method !== "fixed" && ` · ${r.definition.rate}${r.definition.method.includes("percent") ? "%" : ` R$/${r.definition.unit}`}`}</p><p className="text-xs text-muted-foreground">Vigência: {r.definition.startMonth} até {r.definition.endMonth || "sem fim definido"}</p></div><div className="flex flex-wrap gap-2">
        <Button disabled={busy || !r.active || month < r.definition.startMonth || Boolean(r.definition.endMonth && month > r.definition.endMonth) || data.entries.some(e => e.rule_id === r.id)} onClick={() => { setGenerate(r); setBase(""); setNote(""); setError(""); }}>Gerar mês</Button>
        <Button variant="outline" disabled={busy} onClick={() => { setEditor(structuredClone(r.definition)); setEditId(r.id); setError(""); }}>Editar regra</Button>
        <Button variant="outline" disabled={busy} onClick={() => action({ action: "archive", id: r.id, active: !r.active }, r.active ? "Cadastro arquivado. Histórico preservado." : "Cadastro reativado.")}>{r.active ? "Arquivar" : "Reativar"}</Button>
      </div></Card>)}</div> : <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Opcional: crie as divisões da sua empresa. Quem tem um caminhão pode usar apenas “Geral”.</p><Button variant="outline" onClick={() => { setOpOpen(true); setError(""); }}>Nova operação</Button></div>{data.operations.map(op => <Card key={op.id} className="p-4">{op.name}</Card>)}</div>}

    <Modal open={!!editor} onClose={() => !busy && setEditor(null)} title={editId ? "Editar regra — próximos lançamentos" : "Novo custo ou remuneração"} className="max-w-2xl">
      {editor && <form onSubmit={saveRule} className="max-h-[75vh] space-y-4 overflow-y-auto p-1">{errorBox}
        <Field label="Nome do cadastro"><input className={control} required maxLength={120} placeholder="Ex.: Salário do motorista ou seguro do caminhão" value={editor.name} onChange={e => update("name", e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Categoria"><select className={control} value={editor.category} onChange={e => update("category", e.target.value as CostRule["category"])}>{Object.entries(categories).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Como calcular"><select className={control} value={editor.method} onChange={e => update("method", e.target.value as CostRule["method"])}>{Object.entries(methods).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Motorista cadastrado (opcional)"><select className={control} value={editor.driverId || ""} onChange={e => { update("driverId", e.target.value || null); if (e.target.value) update("person", drivers.find(d => d.id === e.target.value)?.name || ""); }}><option value="">Outra pessoa / não vincular</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Pessoa / beneficiário"><input className={control} maxLength={120} value={editor.person} onChange={e => update("person", e.target.value)} placeholder="Também aceita operadores e equipe administrativa" /></Field></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {editor.method.includes("fixed") && <Field label="Valor fixo mensal (R$)"><input className={control} type="number" min="0.01" max="100000000" step="0.01" required value={editor.fixed || ""} onChange={e => update("fixed", Number(e.target.value))} /></Field>}
          {editor.method !== "fixed" && <Field label={editor.method.includes("percent") ? "Comissão (%)" : "Valor por unidade (R$)"}><input className={control} type="number" min="0.01" max={editor.method.includes("percent") ? 100 : 100000000} step="0.01" required value={editor.rate || ""} onChange={e => update("rate", Number(e.target.value))} /></Field>}
          {editor.method.includes("unit") && <Field label="Unidade"><input className={control} required maxLength={40} value={editor.unit} placeholder="tonelada, viagem, carga, hora…" onChange={e => update("unit", e.target.value)} /></Field>}
          {editor.method.includes("percent") && <Field label="Percentual sobre"><select className={control} value={editor.basis} onChange={e => update("basis", e.target.value as CostRule["basis"])}><option value="realizado">Fretes realizados — base informada</option><option value="recebido">Fretes recebidos — base informada</option></select></Field>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><Field label="Mês inicial"><input className={control} type="month" required min="2000-01" max="2099-12" value={editor.startMonth} onChange={e => update("startMonth", e.target.value)} /></Field><Field label="Mês final (opcional)"><input className={control} type="month" min={editor.startMonth} max="2099-12" value={editor.endMonth || ""} onChange={e => update("endMonth", e.target.value || null)} /></Field><Field label="Dia de vencimento"><input className={control} type="number" required min="1" max="31" value={editor.dueDay} onChange={e => update("dueDay", Number(e.target.value))} /></Field></div>
        <Field label="Mês do vencimento"><select className={control} value={editor.dueMonthOffset ?? 0} onChange={e => update("dueMonthOffset", Number(e.target.value))}><option value={0}>No próprio mês de referência</option><option value={1}>No mês seguinte ao mês de referência</option></select></Field>
        <p className="text-xs text-muted-foreground">Exemplo: referência setembro + mês seguinte + dia 5 = vencimento em 05/10. Mês final encerra a repetição do cadastro; não é o mês do pagamento.</p>
        <Field label="Veículo exclusivo (opcional)"><select className={control} value={editor.vehicleId || ""} onChange={e => update("vehicleId", e.target.value || null)}><option value="">Geral / compartilhado — não vincular a um veículo</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <fieldset className="space-y-3 rounded-lg border border-border p-3"><legend className="px-1 text-sm font-semibold">Divisão por operação (opcional)</legend><p className="text-xs text-muted-foreground">Sem divisão, fica em Geral. Se dividir, os percentuais devem somar 100%. O custo não será duplicado.</p>
          {editor.allocations.map((a,i) => <div key={i} className="flex items-end gap-2"><Field label="Operação"><select className={control} required value={a.operationId} onChange={e => update("allocations", editor.allocations.map((x,j) => j === i ? { ...x, operationId: e.target.value } : x))}><option value="">Selecione</option>{data.operations.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}</select></Field><Field label="Percentual"><input className={control} type="number" min="0.01" max="100" step="0.01" required value={a.percent || ""} onChange={e => update("allocations", editor.allocations.map((x,j) => j === i ? { ...x, percent: Number(e.target.value) } : x))} /></Field><Button type="button" variant="outline" aria-label={`Remover divisão ${i+1}`} onClick={() => update("allocations", editor.allocations.filter((_,j) => j !== i))}>×</Button></div>)}
          <Button type="button" variant="outline" disabled={!data.operations.length || editor.allocations.length >= 30} onClick={() => update("allocations", [...editor.allocations, { operationId: "", percent: editor.allocations.length ? 0 : 100 }])}>Adicionar divisão</Button>{!data.operations.length && <p className="text-xs text-muted-foreground">Para dividir, crie primeiro uma operação na aba Operações.</p>}</fieldset>
        <p className="text-xs text-muted-foreground">Este cadastro não gera despesa nem pagamento sozinho. Encargos e benefícios devem ser cadastrados separadamente. Não é folha de pagamento.</p>
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar cadastro"}</Button>
      </form>}
    </Modal>
    <Modal open={opOpen} onClose={() => !busy && setOpOpen(false)} title="Nova operação"><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await action({ action: "operation", name: opName }, "Operação criada.")) { setOpOpen(false); setOpName(""); } }}>{errorBox}<Field label="Nome da operação"><input className={control} value={opName} onChange={e => setOpName(e.target.value)} required minLength={2} maxLength={80} placeholder="Ex.: Transporte, carregamento, filial…" /></Field><Button disabled={busy}>Criar operação</Button></form></Modal>
    <Modal open={!!generate} onClose={() => !busy && setGenerate(null)} title={`Gerar custo — ${month}`}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (generate && await action({ action: "generate", input: { ruleId: generate.id, month, base: Number(base), note } }, "Rascunho gerado. Confira antes de confirmar em Despesas.")) { setGenerate(null); setTab("entries"); } }}>{errorBox}
      <p className="font-semibold">{generate?.definition.name}</p>{generate && generate.definition.method !== "fixed" && <><Field label={generate.definition.method.includes("percent") ? `Valor total dos fretes ${generate.definition.basis === "recebido" ? "recebidos" : "realizados"} elegíveis (R$)` : `Produção no mês (${generate.definition.unit})`}><input className={control} type="number" min="0" max="100000000" step="0.001" required value={base} onChange={e => setBase(e.target.value)} /></Field><Field label="Origem da base / conferência"><textarea className={control} required maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Informe quais fretes, comprovantes e período compõem este total." /></Field></>}
      <p className="text-lg font-semibold">Prévia: {preview ? BRL(preview.amount) : "Informe os dados para calcular"}</p>{preview && <p className="text-sm font-semibold">Referência: {month.split("-").reverse().join("/")} · Vencimento: {preview.dueDate.split("-").reverse().join("/")}</p>}<p className="text-sm text-muted-foreground">Um lançamento por cadastro e mês. Não calcula proporcionalidade por dias automaticamente; ajuste a regra antes de gerar, se necessário.</p><Button disabled={busy || !preview}>Gerar para conferência</Button></form></Modal>
    <Modal open={!!confirmEntry} onClose={() => !busy && setConfirmEntry(null)} title="Confirmar despesa"><div className="space-y-4">{errorBox}<p>{confirmEntry?.snapshot.name} — <strong>{BRL(confirmEntry?.amount || 0)}</strong></p><p className="text-sm">Será criada uma única despesa no mês de referência, com data no dia 1. O vencimento permanece nesta área. Isso afeta os relatórios por competência, mas não realiza nem confirma pagamento.</p><p className="text-sm font-semibold">Confira se esse custo já foi lançado manualmente em Despesas. Após confirmar, o lançamento fica protegido contra edição nesta versão.</p><Button disabled={busy} onClick={async () => { if (confirmEntry && await action({ action: "confirm", id: confirmEntry.id }, "Despesa confirmada uma única vez. Pagamento continua pendente.")) setConfirmEntry(null); }}>Confirmar valor e registrar despesa</Button></div></Modal>
    <Modal open={!!payEntry} onClose={() => !busy && setPayEntry(null)} title="Registrar pagamento já realizado"><div className="space-y-4">{errorBox}<p className="text-sm">Use somente se você já pagou. Este botão não faz transferência, não envia dinheiro e não cria outra despesa.</p><Field label="Data do pagamento"><input className={control} type="date" value={paidDate} max={today()} onChange={e => setPaidDate(e.target.value)} /></Field><Button disabled={busy || !paidDate} onClick={async () => { if (payEntry && await action({ action: "paid", id: payEntry.id, date: paidDate }, "Pagamento registrado, sem duplicar a despesa.")) setPayEntry(null); }}>Confirmar que já foi pago</Button></div></Modal>
    <Modal open={!!discard} onClose={() => !busy && setDiscard(null)} title="Descartar rascunho"><div className="space-y-4">{errorBox}<p>Descartar {discard?.snapshot.name}? O rascunho ainda não foi incluído em Despesas. Você poderá gerá-lo novamente usando a regra atual.</p><Button variant="outline" disabled={busy} onClick={async () => { if (discard && await action({ action: "discard", id: discard.id }, "Rascunho descartado. Nenhuma despesa confirmada foi removida.")) setDiscard(null); }}>Descartar este rascunho</Button></div></Modal>
  </div>;
}
