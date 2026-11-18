"use client";
import {useEffect,useState} from "react";
import {APP_ADDON_CENTS} from "@/lib/individual/addon";
import {staticPixCode} from "@/lib/mercadopago/manualPix";
export function AppAddonPanel({companyId,phone,name}:{companyId:string;phone:string;name:string}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [status,setStatus]=useState<{baseActive:boolean;preserved:boolean;until:string|null}|null>(null);
 const [history,setHistory]=useState<{id:string;reference:string;status:string;access_until:string}[]>([]);
 useEffect(()=>{let cancelled=false;fetch("/api/contratacoes-diretas/adicional?companyId="+encodeURIComponent(companyId),{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!cancelled){setStatus(d.state);setHistory(d.history);}}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;};},[companyId,message]);
 const paymentMessage="Frota IA — adicional do aplicativo. R$ 9,90 por um mês-calendário, sem renovação automática. Requer plano WhatsApp ativo. Não renova o plano-base. Pix Copia e Cola:\n"+staticPixCode(APP_ADDON_CENTS)+"\nConfira valor e recebedor no banco. Após pagar, informe seu WhatsApp de uso. A liberação ocorre após conferência do recebimento.";
 return <section className="space-y-4 rounded-xl border p-5">
 <h2 className="text-xl font-semibold">Adicional do aplicativo · R$ 9,90 por mês</h2>
 <p>{!status?"Consultando condições de acesso…":status.preserved?"Aplicativo já incluído: não cobre adicional.":!status.baseActive?"Ative primeiro o plano WhatsApp.":status.until?"Prazo do adicional: "+new Date(status.until).toLocaleString("pt-BR"):"Adicional não contratado."}</p>
 {status?.baseActive&&!status.preserved&&<><textarea aria-label="Mensagem de cobrança do adicional" className="min-h-40 w-full rounded border p-3" readOnly value={paymentMessage}/>
 <button onClick={()=>navigator.clipboard.writeText(paymentMessage).catch(()=>setError("Selecione e copie o texto manualmente."))}>Copiar cobrança Pix do adicional</button></>}
 <p>Cliente: {name} · {phone}. Requer plano WhatsApp ativo. Um mês-calendário, sem renovação automática. Esta liberação não substitui o plano principal. Clientes com aplicativo já incluído não devem pagar novamente.</p>
 <form className="space-y-3" onSubmit={async e=>{
 e.preventDefault();const form=new FormData(e.currentTarget);
 if(!window.confirm("Confirma que recebeu R$ 9,90 deste cliente para o adicional do aplicativo?"))return;
 setBusy(true);setError("");setMessage("");
 try{const res=await fetch("/api/contratacoes-diretas/adicional",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId,phone,reference:form.get("reference"),amountCents:APP_ADDON_CENTS,paidAt:new Date(String(form.get("paidAt"))).toISOString(),confirmed:true})});const data=await res.json();if(!res.ok)throw new Error(data.error);
 setMessage("Seu adicional do aplicativo Frota IA está liberado até "+new Date(data.receipt.access_until).toLocaleString("pt-BR")+". Mantenha o plano WhatsApp ativo. Para vincular, peça ao Frota IA no seu WhatsApp: quero vincular meu aplicativo. Use o link seguro recebido e entre com sua conta Google. Aplicativo: https://frotaia.up.railway.app/ . Você pode instalar pelo navegador. Renovação mediante novo pagamento, sem cobrança automática.");
 }catch(e){setError(e instanceof Error?e.message:"Não foi possível confirmar. Repita com a mesma referência.");}finally{setBusy(false);}
 }}>
 <label className="block">ID real da transação recebida<input className="block w-full rounded border p-3" name="reference" required pattern="([0-9]{6,30}|[Ee][0-9]{16}[A-Za-z0-9]{15})" maxLength={32} disabled={busy}/></label>
 <label className="block">Data e hora do pagamento<input className="block w-full rounded border p-3" name="paidAt" type="datetime-local" required disabled={busy}/></label>
 <label className="block"><input type="checkbox" required disabled={busy}/> Conferi R$ 9,90 recebidos na conta, a empresa e o número acima.</label>
 <button className="rounded border p-3 disabled:opacity-50" disabled={busy||!!message||!status?.baseActive||status.preserved}>Confirmar Pix e liberar adicional</button>
 </form>
 {error&&<p role="alert">{error}</p>}
 {!!history.length&&<details><summary>Histórico do adicional</summary>{history.map(r=><p key={r.id}>{r.reference} · {r.status} · até {new Date(r.access_until).toLocaleString("pt-BR")}</p>)}</details>}
 {message&&<div><p role="status">Adicional confirmado. Copie a mensagem para o cliente:</p><textarea className="min-h-48 w-full rounded border p-3" readOnly value={message}/><button onClick={()=>navigator.clipboard.writeText(message).catch(()=>setError("Copie o texto manualmente."))}>Copiar mensagem</button></div>}
 </section>;
}
