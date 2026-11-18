"use client";
import { useRef, useState } from "react";
import { CATALOGO_OFERTAS, formatarReais } from "@/lib/mercadopago/catalog";
import { DIRECT_PLANS, type DirectPlan } from "@/lib/mercadopago/directSales";
import {canShareRelease,directReleaseMessage,type DirectReceipt} from "@/lib/mercadopago/directReleaseMessage";
import { PreparedPix } from "./PreparedPix";
import { AppAddonPanel } from "./AppAddonPanel";
type Company={id:string;name:string;fleet_panel_enabled:boolean;subscription:{plan:string;status:string;valido_ate:string|null;hasProviderLink:boolean}|null};
type Receipt=DirectReceipt;
const field="block w-full rounded-lg border border-border bg-background p-3 mt-1";
const button="inline-block rounded-lg border border-border p-3 disabled:opacity-50";
export function DirectSalesClient(){
 const [phone,setPhone]=useState("");const [matchedPhone,setMatchedPhone]=useState("");const [companies,setCompanies]=useState<Company[]>([]);
 const [companyId,setCompanyId]=useState("");const [plan,setPlan]=useState<DirectPlan>("INDIVIDUAL_MENSAL");
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const [history,setHistory]=useState<Receipt[]>([]);
 const pending=useRef<{key:string;id:string}|null>(null);const offer=CATALOGO_OFERTAS[plan];
 const company=companies.find(c=>c.id===companyId);const blocked=company?.fleet_panel_enabled||company?.subscription?.hasProviderLink;
 const receipts=history.filter(r=>r.company_id===companyId);
 const release=receipts.find(r=>canShareRelease(r,companyId,company?.subscription??null));
 const share=release?directReleaseMessage(release,matchedPhone):"";
 async function run(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Falha de conexão. Repita com os mesmos dados.");}finally{setBusy(false);}}
 async function api(url:string,body?:unknown){const r=await fetch(url,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error);return d;}
 return <main className="min-h-dvh bg-background p-4 text-foreground sm:p-8"><div className="mx-auto max-w-3xl space-y-6">
 <header><a href="/empresas" className="underline">Voltar às empresas</a><h1 className="mt-4 text-3xl font-semibold">Contratações diretas / Pix</h1><p className="mt-3">Copie a mensagem de pagamento. Depois confira o recebimento na conta bancária antes de liberar. Sem validação automática de comprovantes ou renovação automática.</p></header>
 <PreparedPix plan={plan} onPlanChange={p=>{setPlan(p);}}/>
 <h2 className="text-xl font-semibold">2. Conferir recebimento e liberar acesso</h2>
 <p className="rounded-lg border p-4">Novo cliente: peça que envie “Olá” ao <a className="underline" href="https://wa.me/5541997454382" target="_blank" rel="noopener noreferrer">WhatsApp do Frota IA</a> usando o número que utilizará no sistema. A conexão do WhatsApp precisa estar ativa para criar esse vínculo. Depois localize esse número abaixo; a busca aceita celular com ou sem o nono dígito. Não crie uma empresa de consultoria para vender este plano.</p>
 {notice&&<p role="status" className="rounded-lg border p-4">{notice}</p>}
 {error&&<p role="alert" className="border border-red-500 rounded-lg p-4">{error}</p>}
 <form className="space-y-3" onSubmit={e=>{e.preventDefault();run(async()=>{setNotice("");setCompanyId("");setCompanies([]);setHistory([]);const d=await api(`/api/contratacoes-diretas?phone=${encodeURIComponent(phone)}`);setMatchedPhone(d.phone);setCompanies(d.companies);setHistory(d.history??[]);if(d.companies.length===1)setCompanyId(d.companies[0].id);if(!d.companies.length)throw new Error("Número ainda não vinculado a uma empresa. Peça o primeiro contato no Frota IA e tente novamente.");});}}>
 <label>WhatsApp de uso do cliente, com DDD<input className={field} type="tel" required value={phone} disabled={busy} onChange={e=>{setPhone(e.target.value);setCompanyId("");setCompanies([]);setNotice("");}}/></label><button className={button} disabled={busy}>Localizar cliente</button></form>
 {!!companies.length&&<form className="rounded-xl border p-5 space-y-4" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const data={companyId,phone:matchedPhone,plan,reference:String(f.get("reference")).trim().toUpperCase(),amountCents:Math.round(Number(String(f.get("amount")).replace(",","."))*100),paidAt:new Date(String(f.get("paidAt"))).toISOString(),confirmed:true};
 const existing=history.find(r=>r.reference.toUpperCase()===data.reference);if(existing){setError("");setNotice(existing.company_id===companyId&&existing.plan===plan&&existing.amount_cents===data.amountCents?"Este pagamento já está registrado. Use a mensagem de liberação abaixo. Nenhuma renovação foi feita.":"Essa transação já consta com outros dados. Confira o histórico e o comprovante; não registre novamente.");return;}
 if(!window.confirm(`Confirmar recebimento de ${formatarReais(offer.precoCentavos)} para ${company?.name}, ${matchedPhone}, ${offer.label}? A liberação começa agora; renovação compatível preserva os dias restantes.`))return;
 run(async()=>{const key=JSON.stringify(data);if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};const d=await api("/api/contratacoes-diretas",{...data,requestId:pending.current.id});setHistory(h=>[d.receipt,...h.filter(r=>r.id!==d.receipt.id)]);
 const updated=await api("/api/contratacoes-diretas?phone="+encodeURIComponent(matchedPhone));setCompanies(updated.companies);setHistory(updated.history??[]);setNotice("Recebimento registrado. Copie a mensagem de liberação abaixo.");
 });}}>
 <label>Cadastro do cliente no Frota IA<select required className={field} value={companyId} disabled={busy} onChange={e=>{setCompanyId(e.target.value);setNotice("");}}><option value="">Selecione o cadastro do cliente</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <p className="text-sm">“Minha operação” é o nome provisório do cadastro criado pelo WhatsApp. É onde ficam os dados desse cliente. Não é outra contratação nem uma empresa que você precisa criar.</p>
 {company&&<p>WhatsApp: {matchedPhone}. Situação atual: {company.subscription?.status??"Sem assinatura"} · {company.subscription?.plan??"—"}. Vencimento: {company.subscription?.valido_ate?new Date(company.subscription.valido_ate).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Sem data"}.</p>}
 {blocked&&<p role="alert">Empresa com liberação especial ou vínculo Mercado Pago. Reconcilie o acesso existente antes de vender; esta tela não altera nem cancela essa liberação.</p>}
 <details key={companyId+String(!!share)} open={!share}><summary className="cursor-pointer font-semibold">{share?"Registrar outro pagamento ou renovação":"Registrar pagamento recebido"}</summary>{share&&<p className="my-3">O plano já está ativo. Use este formulário somente para outro pagamento real. Para reenviar a confirmação, copie a mensagem abaixo.</p>}
 <label>Plano e período<select className={field} value={plan} disabled={busy} onChange={e=>{setPlan(e.target.value as DirectPlan);setNotice("");}}>{DIRECT_PLANS.map(p=><option key={p} value={p}>{CATALOGO_OFERTAS[p].label} · {p.includes("ANUAL")?"Anual (365 dias)":"Mensal"} · {formatarReais(CATALOGO_OFERTAS[p].precoCentavos)}</option>)}</select></label>
 <p>{offer.limiteVeiculos} veículo(s) · {offer.painel?"WhatsApp + painel":"WhatsApp"}. Sem renovação automática. Mensal: um mês-calendário; anual: 365 dias. Renovação do mesmo plano soma ao vencimento se ainda ativo.</p>
 <label>Identificador da transação: ID Mercado Pago ou EndToEnd Pix<input className={field} name="reference" required pattern="([0-9]{6,30}|[Ee][0-9]{16}[A-Za-z0-9]{15})" maxLength={32} disabled={busy}/></label>
 <p className="text-sm text-muted-foreground">Copie o ID real do recebimento: ID numérico do Mercado Pago ou identificador EndToEnd Pix (32 caracteres, começando com E). Não use o código Pix Copia e Cola, a chave ou uma referência inventada.</p><label>Valor efetivamente recebido (R$)<input className={field} name="amount" inputMode="decimal" placeholder="89,90" required disabled={busy}/></label>
 <label>Data e hora do pagamento<input className={field} name="paidAt" type="datetime-local" required disabled={busy}/></label>
 <label className="flex gap-3"><input type="checkbox" required disabled={busy}/>Conferi o dinheiro recebido na conta, o plano, a empresa e o WhatsApp. Não estou usando somente um print de comprovante.</label>
 <button className={`${button} bg-primary text-primary-foreground`} disabled={busy||!company||!!blocked}>Confirmar recebimento e liberar plano</button></details>
 </form>}
 {share&&<section className="space-y-3 rounded-lg border border-emerald-500 p-4"><h2 className="text-xl" role="status">Liberação confirmada</h2><p>Mensagem recuperada do pagamento salvo. Ela continua disponível ao atualizar e localizar o cliente novamente. Copie e envie pelo WhatsApp.</p><textarea aria-label="Mensagem de plano liberado" className={`${field} min-h-56`} readOnly value={share}/><button className={button} onClick={()=>run(()=>navigator.clipboard.writeText(share))}>Copiar mensagem de liberação</button></section>}
 {!!receipts.length&&<section className="space-y-3"><h2 className="text-xl">Últimas liberações deste cliente</h2>{receipts.map(r=><article key={r.id} className="rounded-lg border p-3"><p>{r.plan} · {formatarReais(r.amount_cents)}</p><p>Transação {r.reference} · acesso até {new Date(r.access_until).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</p>{canShareRelease(r,companyId,company?.subscription??null)&&<button type="button" className={button} onClick={()=>run(async()=>{await navigator.clipboard.writeText(directReleaseMessage(r,matchedPhone));setNotice("Mensagem recuperada do histórico e copiada. Nenhum pagamento foi registrado novamente.");})}>Copiar liberação deste pagamento</button>}</article>)}</section>}
 {company&&<details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">3. Opcional — adicional do aplicativo · R$ 9,90</summary><p className="my-3">Abra somente se o cliente quiser contratar o aplicativo. O WhatsApp funciona com o plano principal, sem este adicional.</p><AppAddonPanel key={company.id+String(!!share)} companyId={company.id} phone={matchedPhone} name={company.name}/></details>}
 </div></main>;
}
