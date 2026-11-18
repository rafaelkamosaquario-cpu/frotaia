"use client";
import {useState} from "react";
export function AppNews({onAsk}:{onAsk:(text:string)=>void}) {
 const [content,setContent]=useState(""),[busy,setBusy]=useState(false);
 return <details><summary>Notícias do transporte</summary><p>Consulte o último resumo disponível ou peça uma busca atualizada ao assistente.</p>
 <button disabled={busy} onClick={async()=>{setBusy(true);try{const r=await fetch("/api/individual/news",{cache:"no-store"}),d=await r.json();if(!r.ok)throw new Error(d.error);setContent(d.digest?"Resumo de "+new Date(d.digest.generated_at).toLocaleString("pt-BR")+"\n"+d.digest.content:"Nenhum resumo publicado. Peça uma busca atualizada.");}catch(e){setContent(e instanceof Error?e.message:"Não foi possível consultar.");}finally{setBusy(false);}}}>Ver último resumo</button>
 <button onClick={()=>onAsk("Busque notícias recentes do transporte em fontes oficiais e imprensa especializada. Informe fonte, data e links. Não invente notícias.")}>Buscar notícias atualizadas</button>
 {content&&<p className="whitespace-pre-wrap" role="status">{content}</p>}</details>;
}
