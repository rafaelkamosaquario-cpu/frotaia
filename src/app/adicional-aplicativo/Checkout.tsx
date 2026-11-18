"use client";
import {useState} from "react";
export function AddonCheckout(){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function pay(method:string){setBusy(true);setError("");try{
  const r=await fetch("/api/individual/addon",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({method})});
  const d=await r.json();if(!r.ok)throw new Error(d.error);window.location.assign(d.url);
 }catch(e){setError(e instanceof Error?e.message:"Falha de conexão.");setBusy(false);}}
 return <div className="space-y-3"><p>Mercado Pago · pagamento único de R$ 9,90 por um mês, sem renovação automática.</p><div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>pay("pix")} className="rounded-lg border p-3">Pagar Pix pelo Mercado Pago</button><button disabled={busy} onClick={()=>pay("credito")} className="rounded-lg border p-3">Pagar com cartão</button></div>{busy&&<p role="status">Preparando checkout…</p>}{error&&<p role="alert">{error}</p>}</div>;
}
