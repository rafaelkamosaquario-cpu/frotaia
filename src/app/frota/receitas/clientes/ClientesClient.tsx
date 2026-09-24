"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import type { FreightCustomerRow } from "@/lib/frota/freightCustomers";

export function ClientesClient({ initial, canEdit }: { initial: FreightCustomerRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial);
  const [target, setTarget] = useState<FreightCustomerRow | null | undefined>();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function open(row: FreightCustomerRow | null) { setError(""); setSuccess(""); setTarget(row); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(["name", "legal_name", "cnpj", "address", "city", "state", "notes"].map(k => [k, String(form.get(k) ?? "").trim()]));
    try {
      const response = await fetch("/api/frota/clientes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(target ? { id: target.id } : {}), closing_day: form.get("closing_day") ? Number(form.get("closing_day")) : null }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Não foi possível salvar."); return; }
      setRows(previous => [...previous.filter(r => r.id !== result.customer.id), result.customer].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setTarget(undefined); setSuccess("Cliente salvo. Nenhuma receita foi gerada.");
    } catch { setError("Falha de conexão. Tente novamente."); }
    finally { setBusy(false); }
  }
  const filtered = rows.filter(r => `${r.name} ${r.legal_name ?? ""} ${r.cnpj ?? ""}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
    <Link href="/frota/receitas" className="text-sm text-primary hover:underline">← Voltar para Receitas</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-lg font-semibold">Clientes do transporte</h1><p className="text-sm text-muted-foreground">{rows.length} cliente(s) cadastrado(s)</p></div>{canEdit && <Button onClick={() => open(null)}>Novo cliente</Button>}</div>
    <Card className="p-4 text-sm text-muted-foreground">Cadastre as empresas para as quais você presta serviço. Nesta etapa, o cadastro não gera receitas. Tarifas por rota, pesagens e fechamentos automáticos serão integrados depois.</Card>
    {success && <p role="status" className="text-sm text-success">{success}</p>}
    <Input aria-label="Buscar cliente" placeholder="Buscar por nome ou CNPJ" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid gap-4 md:grid-cols-2">
      {filtered.map(row => <Card key={row.id} className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{row.name}</h2>{canEdit && <Button variant="outline" size="sm" aria-label={`Editar ${row.name}`} onClick={() => open(row)}>Editar</Button>}</div>
        <p className="text-sm text-muted-foreground">{row.legal_name || "Razão social a preencher"}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-muted-foreground">CNPJ</dt><dd>{row.cnpj || "Não informado"}</dd><dt className="text-muted-foreground">Cidade / UF</dt><dd>{[row.city, row.state].filter(Boolean).join(" / ") || "Não informado"}</dd><dt className="text-muted-foreground">Fechamento</dt><dd>{row.closing_day ? `Dia ${row.closing_day}` : "A definir"}</dd></dl>
        {row.address && <p className="text-sm">{row.address}</p>}
        <p className="text-xs text-muted-foreground">Tarifas: ainda não configuradas</p>
        {row.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.notes}</p>}
      </Card>)}
    </div>
    {!filtered.length && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
    <Modal open={target !== undefined} onClose={() => { if (!busy) setTarget(undefined); }} title={target ? "Editar cliente" : "Novo cliente"}>
      <form key={target?.id ?? "new"} onSubmit={save} className="space-y-3">
        {([ ["name", "Nome do cliente", 160], ["legal_name", "Razão social (opcional)", 200], ["cnpj", "CNPJ (opcional)", 18], ["address", "Endereço (opcional)", 300], ["city", "Cidade (opcional)", 100], ["state", "UF (opcional)", 2] ] as const).map(([key, label, max]) => <label key={key} className="block text-sm">{label}<Input name={key} required={key === "name"} minLength={key === "name" ? 2 : undefined} maxLength={max} defaultValue={target?.[key] ?? ""} disabled={busy} /></label>)}
        <label className="block text-sm">Dia de fechamento (opcional)<Input name="closing_day" type="number" min={1} max={31} step={1} defaultValue={target?.closing_day ?? ""} disabled={busy} /></label>
        <p className="text-xs text-muted-foreground">Não é o vencimento do pagamento. Informar o dia ainda não agenda avisos nem gera fechamentos.</p>
        <label className="block text-sm">Observações (opcional)<textarea name="notes" maxLength={2000} defaultValue={target?.notes ?? ""} disabled={busy} className="mt-1 min-h-20 w-full rounded-lg border border-border bg-surface p-2" /></label>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setTarget(undefined)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar cliente"}</Button></div>
      </form>
    </Modal>
  </div>;
}

