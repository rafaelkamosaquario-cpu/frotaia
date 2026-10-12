"use client";
import { useRef, useState } from "react";
import { CATALOGO_OFERTAS, formatarReais } from "@/lib/mercadopago/catalog";
import { DIRECT_PLANS, type DirectPlan } from "@/lib/mercadopago/directSales";
type Company={id:string;name:string;fleet_panel_enabled:boolean;subscription:{plan:string;status:string;valido_ate:string|null;hasProviderLink:boolean}|null};
type Receipt={id:string;reference:string;plan:string;amount_cents:number;access_until:string};
const field="block w-full rounded-lg border border-border bg-background p-3 mt-1";
const button="inline-block rounded-lg border border-border p-3 disabled:opacity-50";
export function DirectSalesClient(){
 const [phone,setPhone]=useState("");const [matchedPhone,setMatchedPhone]=useState("");const [companies,setCompanies]=useState<Company[]>([]);
 const [companyId,setCompanyId]=useState("");const [plan,setPlan]=useState<DirectPlan>("INDIVIDUAL_MENSAL");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [share,setShare]=useState("");
 const [history,setHistory]=useState<Receipt[]>([]);
 const pending=useRef<{key:string;id:string}|null>(null);const offer=CATALOGO_OFERTAS[plan];
 const company=companies.find(c=>c.id===companyId);const blocked=company?.fleet_panel_enabled||company?.subscription?.hasProviderLink;
 async function run(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Falha de conexão. Repita com os mesmos dados.");}finally{setBusy(false);}}
 async function api(url:string,body?:unknown){const r=await fetch(url,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
 return <main className="min-h-dvh bg-background p-4 text-foreground sm:p-8"><div className="mx-auto max-w-3xl space-y-6">
 <header><a href="/empresas" className="underline">Voltar às empresas</a><h1 className="mt-4 text-3xl font-semibold">Contratações diretas / Pix</h1><p className="mt-3">Confira o recebimento no Mercado Pago antes de liberar. Este caminho não gera cobrança, não valida comprovantes e não renova automaticamente.</p></header>
 <p className="rounded-lg border p-4">Novo cliente: peça que envie “Olá” ao <a className="underline" href="https://wa.me/5541997454382" target="_blank" rel="noopener noreferrer">WhatsApp do Frota IA</a> usando o número que utilizará no sistema. Depois localize esse número abaixo. Não crie uma empresa de consultoria para vender este plano.</p>
 {error&&<p role="alert" className="border border-red-500 rounded-lg p-4">{error}</p>}
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{setShare("");setCompanyId("");setCompanies([]);setHistory([]);const d=await api(`/api/contratacoes-diretas?phone=${encodeURIComponent(phone)}`);setMatchedPhone(d.phone);setCompanies(d.companies);setHistory(d.history??[]);if(!d.companies.length)throw new Error("Número ainda não vinculado a uma empresa. Peça o primeiro contato no Frota IA e tente novamente.");});}}>
 <label>WhatsApp de uso do cliente, com DDD<input className={field} type="tel" required value={phone} disabled={busy} onChange={e=>{setPhone(e.target.value);setCompanyId("");setCompanies([]);setShare("");}}/></label><button className={button} disabled={busy}>Localizar cliente</button></form>
 {!!companies.length&&<form className="rounded-xl border p-5 space-y-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const data={companyId,phone:matchedPhone,plan,reference:String(f.get("reference")),amountCents:Math.round(Number(String(f.get("amount")).replace(",","."))*100),paidAt:new Date(String(f.get("paidAt"))).toISOString(),confirmed:true};
 if(!window.confirm(`Confirmar recebimento de ${formatarReais(offer.precoCentavos)} para ${company?.name}, ${matchedPhone}, ${offer.label}? A liberação começa agora; renovação compatível preserva os dias restantes.`))return;
 run(async()=>{const key=JSON.stringify(data);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};const d=await api("/api/contratacoes-diretas",{...data,requestId:pending.current.id});setHistory(h=>[d.receipt,...h.filter(r=>r.id!==d.receipt.id)]);
 setShare(`Seu acesso ao ${offer.label} foi liberado após confirmação do Pix. WhatsApp autorizado: ${matchedPhone}. Válido até ${new Date(d.receipt.access_until).toLocaleString("pt-BR")}.\nAbra https://wa.me/5541997454382 e envie Olá para continuar seu cadastro ou usar o assistente.${offer.painel?"\nDepois de concluir o cadastro, peça ao Frota IA: quero vincular meu painel. Abra o link seguro recebido no seu próprio WhatsApp e entre com sua conta. Não crie outra empresa.":""}\nRenovação por novo pagamento confirmado, sem cobrança automática.`);
 });}}>
 <label>Empresa identificada<select required className={field} value={companyId} disabled={busy} onChange={e=>{setCompanyId(e.target.value);setShare("");}}><option value="">Selecione e confira</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {company&&<p>WhatsApp: {matchedPhone}. Situação atual: {company.subscription?.status??"Sem assinatura"} · {company.subscription?.plan??"—"}. Vencimento: {company.subscription?.valido_ate?new Date(company.subscription.valido_ate).toLocaleString("pt-BR"):"Sem data"}.</p>}
 {blocked&&<p role="alert">Empresa com liberação especial ou vínculo Mercado Pago. Reconcilie o acesso existente antes de vender; esta tela não altera nem cancela essa liberação.</p>}
 <label>Plano e período<select className={field} value={plan} disabled={busy} onChange={e=>{setPlan(e.target.value as DirectPlan);setShare("");}}>{DIRECT_PLANS.map(p=><option key={p} value={p}>{CATALOGO_OFERTAS[p].label} · {p.includes("ANUAL")?"Anual (365 dias)":"Mensal"} · {formatarReais(CATALOGO_OFERTAS[p].precoCentavos)}</option>)}</select></label>
 <p>{offer.limiteVeiculos} veículo(s) · {offer.painel?"WhatsApp + painel":"WhatsApp"}. Sem renovação automática. Mensal: um mês-calendário; anual: 365 dias. Renovação do mesmo plano soma ao vencimento se ainda ativo.</p>
 <label>ID numérico da transação no Mercado Pago<input className={field} name="reference" required pattern="[0-9]{6,30}" maxLength={30} disabled={busy}/></label>
 <label>Valor efetivamente recebido (R$)<input className={field} name="amount" inputMode="decimal" placeholder="89,90" required disabled={busy}/></label>
 <label>Data e hora do pagamento<input className={field} name="paidAt" type="datetime-local" required disabled={busy}/></label>
 <label className="flex gap-3"><input type="checkbox" required disabled={busy}/>Conferi o dinheiro recebido na conta, o plano, a empresa e o WhatsApp. Não estou usando somente um print de comprovante.</label>
 <button className={`${button} bg-primary text-primary-foreground`} disabled={busy||!company||!!blocked||!!share}>Confirmar recebimento e liberar plano</button>
 </form>}
 {share&&<section className="space-y-3 rounded-lg border border-emerald-500 p-4"><h2 className="text-xl" role="status">Liberação confirmada</h2><p>Copie e envie ao cliente. Nenhuma mensagem foi disparada automaticamente.</p><textarea className={`${field} min-h-56`} readOnly value={share}/><button className={button} onClick={()=>run(()=>navigator.clipboard.writeText(share))}>Copiar mensagem</button></section>}
 {!!history.length&&<section className="space-y-3"><h2 className="text-xl">Últimas liberações deste cliente</h2>{history.map(r=><article key={r.id} className="rounded-lg border p-3"><p>{r.plan} · {formatarReais(r.amount_cents)}</p><p>Transação {r.reference} · acesso até {new Date(r.access_until).toLocaleString("pt-BR")}</p></article>)}</section>}
 </div></main>;
}
