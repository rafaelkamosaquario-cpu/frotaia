"use client";
import {useEffect,useState} from "react";
import {DIRECT_PLANS} from "@/lib/mercadopago/directSales";
import {CATALOGO_OFERTAS} from "@/lib/mercadopago/catalog";
type Customer={company_id:string;phone:string;name:string;plan:string;paid_at:string;subscription:{plan:string;status:string;valido_ate:string|null}|null};
export function ManualCustomers({onSelect,refreshKey,busy=false}:{busy?:boolean;onSelect:(phone:string)=>void;refreshKey:unknown}){
  const [plan,setPlan]=useState("");const [page,setPage]=useState(1);const [version,setVersion]=useState(0);
  const [result,setResult]=useState<{customers:Customer[];total:number;pages:number}|null>(null);const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();setError("");setResult(null);
    fetch(`/api/contratacoes-diretas/clientes?page=${page}&plan=${encodeURIComponent(plan)}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setResult(d);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[plan,page,version,refreshKey]);
  return <section className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-label="Clientes de contratação manual">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">Clientes de contratação manual</h2><p className="mt-1 text-sm text-muted-foreground">Uma linha por cliente, com a última contratação manual e a situação atual. Abra para consultar pagamentos, copiar a liberação ou atender o adicional.</p></div><button type="button" className="rounded-lg border px-3 py-2" onClick={()=>setVersion(v=>v+1)}>Atualizar lista</button></div>
    <label className="block text-sm">Último plano contratado manualmente<select className="mt-1 block w-full rounded-lg border border-border bg-background p-3" value={plan} onChange={e=>{setPlan(e.target.value);setPage(1);}}><option value="">Todos os planos</option>{DIRECT_PLANS.map(p=><option key={p} value={p}>{CATALOGO_OFERTAS[p].label}</option>)}</select></label>
    {error?<p role="alert">{error}</p>:!result?<p role="status">Consultando clientes…</p>:<><p className="text-sm">{result.total} cliente(s) · página {page} de {result.pages}</p>{!result.customers.length&&<p>Nenhuma contratação manual registrada para este filtro. Para um novo cliente, use a busca por WhatsApp abaixo.</p>}
    {result.customers.map(c=><article key={c.company_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"><div><h3 className="font-semibold">{c.name}</h3><p className="text-sm">{c.phone}</p><p className="text-sm text-muted-foreground">Última contratação: {CATALOGO_OFERTAS[c.plan as keyof typeof CATALOGO_OFERTAS]?.label??c.plan}</p><p className="text-sm">Assinatura: {c.subscription?.status??"Sem assinatura"}{c.subscription?.valido_ate?` · validade ${new Date(c.subscription.valido_ate).toLocaleDateString("pt-BR")}`:""}</p></div><button type="button" disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50" onClick={()=>onSelect(c.phone)}>Abrir cliente</button></article>)}
    <div className="flex gap-3"><button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</button><button type="button" className="rounded border px-3 py-2 disabled:opacity-40" disabled={page>=result.pages} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></>}
  </section>;
}
