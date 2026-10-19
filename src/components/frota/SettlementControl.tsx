"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { settlementLabel, settlementTotals, type SettlementFields } from "@/lib/frota/settlement";

export function SettlementSummary({rows,revenue=false}:{rows:(SettlementFields & {amount:number})[];revenue?:boolean}) {
  const t=settlementTotals(rows);
  const money=(v:number)=>v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  return <div className="mb-4 rounded-lg border border-border p-3 text-sm">
    <p>{revenue?"Recebidas":"Pagas"}: {money(t.settled)} · {revenue?"A receber":"A pagar"}: {money(t.pending)} · Não informado: {money(t.unknown)}</p>
    <p className="text-xs text-muted-foreground">Resumo dos registros filtrados por competência. Não é saldo bancário. Baixas sem data não compõem um fluxo de caixa por data.</p>
  </div>;
}
export function SettlementFilter({value,onChange,revenue=false}:{value:string;onChange:(v:string)=>void;revenue?:boolean}) {
  return <select aria-label="Filtrar situação financeira" value={value} onChange={e=>onChange(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3 text-sm">
    <option value="">Todas as situações</option><option value="pending">{revenue?"A receber":"A pagar"}</option>
    <option value="settled">{revenue?"Recebidas":"Pagas"}</option><option value="unknown">Não informado</option>
  </select>;
}
export function SettlementControl<T extends SettlementFields & {id:string;amount:number}>({row,kind,onSaved,canEdit=true,linked=false}:{
  row:T;kind:"expenses"|"revenues";onSaved:(row:T)=>void;canEdit?:boolean;linked?:boolean;
}) {
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState<"pending"|"settled">("settled");
  const [date,setDate]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const revenue=kind==="revenues";
  async function save(e:React.FormEvent) {
    e.preventDefault();if(busy)return;setBusy(true);setError("");
    try {
      const response=await fetch("/api/frota/baixas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        kind,id:row.id,status,date:status==="settled"&&date?date:null,note,version:row.settlement_version??0,
      })});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Não foi possível salvar.");
      onSaved(data.record);setOpen(false);
    } catch(e) {setError(e instanceof Error?e.message:"Falha de conexão.");} finally{setBusy(false);}
  }
  return <div className="text-sm">
    <p className={row.settlement_status==="settled"?"text-success":"text-muted-foreground"}>{settlementLabel(row,revenue)}</p>
    {row.settlement_status==="settled"&&<p className="text-xs">{row.settled_on?row.settled_on.split("-").reverse().join("/"):"Data não informada"}</p>}
    {linked?<a className="text-xs text-primary" href="/frota/custos">Ver remuneração</a>:canEdit&&<button className="text-xs text-primary underline" onClick={()=>{
      setStatus(row.settlement_status==="pending"?"settled":row.settlement_status==="settled"?"settled":"pending");
      setDate(row.settled_on??"");setNote("");setError("");setOpen(true);
    }}>Registrar / corrigir baixa</button>}
    <Modal open={open} onClose={()=>{if(!busy)setOpen(false);}} title={revenue?"Recebimento da receita":"Pagamento da despesa"}>
      <form onSubmit={save} className="space-y-4">
        <p>Valor integral: {row.amount.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}. A baixa não altera o valor nem a competência.</p>
        <label className="block">Situação<select className="block w-full rounded border border-border bg-surface p-2" value={status} onChange={e=>setStatus(e.target.value as "pending"|"settled")}>
          <option value="pending">{revenue?"A receber":"A pagar"}</option><option value="settled">{revenue?"Recebida":"Paga"}</option>
        </select></label>
        {status==="settled"&&<label className="block">Data efetiva (se conhecida)<input className="block w-full rounded border border-border bg-surface p-2" type="date" value={date} onChange={e=>setDate(e.target.value)}/><small>Sem data: confirmação registrada, data pendente de informação.</small></label>}
        <label className="block">Confirmação / motivo da correção<textarea required minLength={5} maxLength={500} className="block w-full rounded border border-border bg-surface p-2" value={note} onChange={e=>setNote(e.target.value)}/></label>
        <p className="text-xs text-muted-foreground">Registre somente pagamentos ou recebimentos que você conferiu. Esta ação não transfere dinheiro. Alterações ficam no histórico de auditoria.</p>
        {error&&<p role="alert" className="text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>{busy?"Salvando…":"Confirmar situação"}</Button>
      </form>
    </Modal>
  </div>;
}
