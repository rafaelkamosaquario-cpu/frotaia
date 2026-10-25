"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AudioLines, CircleDollarSign, Newspaper, FileText, History, Mic, Route, Send, Square, Volume2, X, Plus, LogOut, RefreshCw } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useChat } from "@/hooks/useChat";
import { signOut } from "@/services/supabase/authService";
import { FROTA_SUGGESTIONS } from "@/lib/frotaSuggestions";
import styles from "./DriverAssistant.module.css";

type Recognition = { lang:string; continuous:boolean; interimResults:boolean; onresult:((event:{results:{[index:number]:{[index:number]:{transcript:string}}}})=>void)|null; onerror:((event:{error:string})=>void)|null; onend:(()=>void)|null; start:()=>void; abort:()=>void };

export function DriverAssistant({calendarConnected}:{calendarConnected:boolean}) {
 const conversations=useConversations();
 const {messages,isTyping,sendMessage,errorMessage}=useChat({conversation:conversations.activeConversation,onPersist:conversations.persistConversation});
 const [draft,setDraft]=useState(""); const [notice,setNotice]=useState(""); const [listening,setListening]=useState(false); const [speaking,setSpeaking]=useState(false); const [voiceReplies,setVoiceReplies]=useState(false); const [panel,setPanel]=useState<"history"|"tools"|null>(null);
 const recognition=useRef<Recognition|null>(null);const alive=useRef(true);const busy=useRef(false);const bottom=useRef<HTMLDivElement>(null);
 const lastAnswer=[...messages].reverse().find(m=>m.role==="assistant")?.content;
 const [voices,setVoices]=useState<SpeechSynthesisVoice[]>([]);
 const [voiceURI,setVoiceURI]=useState("");
 useEffect(()=>{
   if(!("speechSynthesis" in window))return;
   const refresh=()=>setVoices(window.speechSynthesis.getVoices().slice().sort((a,b)=>Number(b.lang.startsWith("pt"))-Number(a.lang.startsWith("pt"))||a.name.localeCompare(b.name)));
   const initialize=window.setTimeout(()=>{try{setVoiceURI(localStorage.getItem("frota-assistant-voice")||"");}catch{}refresh();},0);
   window.speechSynthesis.addEventListener("voiceschanged",refresh);
   return()=>{window.clearTimeout(initialize);window.speechSynthesis.removeEventListener("voiceschanged",refresh);};
 },[]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;recognition.current?.abort();window.speechSynthesis?.cancel();};},[]);
 useEffect(()=>{
   // The root file-based manifest is also used by the enterprise panel.
   // Switch only while this individual assistant is mounted.
   const links=Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'));
   const previous=links.map(link=>link.getAttribute("href"));
   const added=links.length===0?document.createElement("link"):null;
   if(added){added.rel="manifest";document.head.appendChild(added);links.push(added);}
   links.forEach(link=>{link.href="/assistente.webmanifest";});
   return()=>{links.forEach((link,index)=>{if(link===added)link.remove();else if(previous[index])link.setAttribute("href",previous[index]!);});};
 },[]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[messages.length,isTyping]);
 function stopVoice(){window.speechSynthesis?.cancel();setSpeaking(false);}
 function read(text:string){if(!("speechSynthesis" in window)){setNotice("Voz indisponível neste navegador. A resposta continua disponível em texto.");return;}stopVoice();const speech=new SpeechSynthesisUtterance(text.replace(/[*#_`]/g,""));const voice=voices.find(v=>v.voiceURI===voiceURI);speech.voice=voice||null;speech.lang=voice?.lang||"pt-BR";speech.onstart=()=>{if(alive.current)setSpeaking(true);};speech.onend=speech.onerror=()=>{if(alive.current)setSpeaking(false);};window.speechSynthesis.speak(speech);}
 async function send(){if(!draft.trim()||busy.current||isTyping)return;busy.current=true;recognition.current?.abort();setListening(false);stopVoice();const text=draft;setDraft("");try{const answer=await sendMessage(text);if(answer&&alive.current&&voiceReplies)read(answer);if(!answer&&alive.current)setDraft(text);}finally{busy.current=false;}}
 function listen(){if(listening){recognition.current?.abort();setListening(false);return;}const w=window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};const C=w.SpeechRecognition||w.webkitSpeechRecognition;if(!C){setNotice("Este navegador não oferece reconhecimento de voz. Use Chrome/Edge compatível ou digite.");return;}if(!window.confirm("Permitir o reconhecimento da sua fala? O navegador pode enviar o áudio ao serviço de voz dele. Fale apenas com o veículo parado. O texto será exibido para você conferir antes de enviar ao Frota IA."))return;stopVoice();const r=new C();recognition.current=r;r.lang="pt-BR";r.continuous=false;r.interimResults=false;r.onresult=e=>{if(alive.current){setDraft(e.results[0][0].transcript);setNotice("Confira o texto e toque em enviar.");}};r.onend=()=>{if(alive.current)setListening(false);};r.onerror=e=>{if(alive.current){setListening(false);setNotice(e.error==="not-allowed"?"Permita o microfone nas configurações do navegador ou digite.":"Não foi possível reconhecer a fala. Tente novamente ou digite.");}};try{r.start();setListening(true);}catch{setNotice("Microfone indisponível agora. Digite ou tente novamente.");}}
 const status=listening?"Ouvindo você…":speaking?"Respondendo por voz":isTyping?"Analisando sua mensagem…":"Como posso ajudar hoje?";
 return <main className={styles.shell}><div className={styles.app}>
 <header className={styles.header}><button aria-label="Histórico" onClick={()=>setPanel("history")}><History/></button><div className={styles.brand}><div><h1>FROTA <span>IA</span></h1><p>Seu assistente na estrada</p></div></div><button aria-label="Nova conversa" disabled={isTyping} onClick={()=>{stopVoice();conversations.startNewConversation();}}><Plus/></button></header>
 <section className={styles.hero} data-active={speaking||listening} aria-label={status}><Image src="/images/assistant-truck-front.png" alt="Caminhão de frente do assistente Frota IA" width={1254} height={1254} priority/><AudioLines className={styles.leftWave} aria-hidden/><AudioLines className={styles.rightWave} aria-hidden/></section>
 <p className={styles.status} aria-live="polite"><AudioLines/>{status}</p>
 <section className={styles.messages} aria-label="Conversa">{!messages.length?<p className={styles.welcome}>Fale ou escreva sobre fretes, pneus, rotas e custos. Eu ajudo você a organizar sua operação.</p>:messages.map(m=><article key={m.id} className={m.role==="user"?styles.user:styles.assistant}><small>{m.role==="user"?"Você":"Frota IA"}</small><p>{m.content}</p>{m.status==="error"&&<small>Não enviado. Confira e tente novamente.</small>}</article>)}{isTyping&&<p role="status">Preparando resposta…</p>}<div ref={bottom}/></section>
 {errorMessage&&<p role="alert" className={styles.notice}>{errorMessage}</p>}
 {lastAnswer&&<button className={styles.audio} onClick={()=>speaking?stopVoice():read(lastAnswer)}>{speaking?<Square/>:<Volume2/>}{speaking?"Parar áudio":"Ouvir resposta"}</button>}
 <nav className={styles.shortcuts} aria-label="Ferramentas">{[{name:"Fretes",icon:FileText,text:"Quero analisar um frete"},{name:"Rotas",icon:Route,text:"Quero planejar uma rota"},{name:"Notícias",icon:Newspaper,text:"Quero consultar notícias do transporte"},{name:"Custos",icon:CircleDollarSign,text:"Quero consultar meus custos"}].map(({name,icon:Icon,text})=><button key={name} disabled={isTyping} onClick={()=>setDraft(text)}><Icon/>{name}</button>)}</nav>
 <button className={styles.more} onClick={()=>setPanel("tools")}>Mais ferramentas</button>
 <button className={styles.talk} disabled={isTyping} onClick={listen}>{listening?<Square/>:<Mic/>}{listening?"Parar escuta":"Toque para falar"}</button>
 <label className={styles.toggle}><input type="checkbox" checked={voiceReplies} onChange={e=>{setVoiceReplies(e.target.checked);if(!e.target.checked)stopVoice();}}/>Ler novas respostas em voz alta</label>
 <details className={styles.voiceSettings}><summary>Configurar voz</summary><label htmlFor="assistant-voice">Voz do assistente</label><select id="assistant-voice" value={voices.some(v=>v.voiceURI===voiceURI)?voiceURI:""} onChange={e=>{stopVoice();setVoiceURI(e.target.value);try{localStorage.setItem("frota-assistant-voice",e.target.value);}catch{}}}><option value="">Padrão do dispositivo · português</option>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select><p>As vozes disponíveis variam conforme o celular e o navegador. Prefira uma voz em português.</p><button type="button" className={styles.audio} onClick={()=>speaking?stopVoice():read("Olá! Eu sou o Frota IA, seu assistente na estrada. Como posso ajudar hoje?")}>{speaking?<Square/>:<Volume2/>}{speaking?"Parar amostra":"Ouvir amostra"}</button></details>
 <form className={styles.composer} onSubmit={e=>{e.preventDefault();void send();}}><textarea aria-label="Sua mensagem" placeholder="Ou digite sua mensagem…" maxLength={6000} value={draft} disabled={isTyping} onChange={e=>setDraft(e.target.value)} rows={2}/><button aria-label="Enviar mensagem" disabled={isTyping||!draft.trim()}><Send/></button></form>
 {notice&&<p className={styles.notice} role="status">{notice}</p>}
 <details className={styles.info}><summary>WhatsApp, aplicativo e instalação</summary><p>Use o link de vínculo enviado ao seu próprio WhatsApp para acessar a mesma operação. Os registros pertencem à empresa vinculada; o histórico exibido aqui é o disponível para seu login.</p><p>Para instalar: no menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. No iPhone, use Compartilhar → Adicionar à Tela de Início.</p><a href="https://wa.me/5541997454382" target="_blank" rel="noopener noreferrer">Abrir WhatsApp do Frota IA</a><p>Agenda Google: {calendarConnected?"conectada":"peça ao assistente para conectar"}.</p></details>
 <footer className={styles.footer}>Use com o veículo parado. Confira os dados antes de confirmar lançamentos.</footer>
 {panel&&<section className={styles.panel} role="dialog" aria-modal="true" aria-label={panel==="history"?"Histórico":"Ferramentas"}><button autoFocus aria-label="Fechar" onClick={()=>setPanel(null)}><X/></button><h2>{panel==="history"?"Suas conversas":"Como posso ajudar?"}</h2>{panel==="history"?<><button disabled={isTyping} onClick={()=>window.location.reload()}><RefreshCw/>Atualizar histórico</button>{conversations.conversations.map(c=><button disabled={isTyping} key={c.id} onClick={()=>{stopVoice();conversations.selectConversation(c.id);setPanel(null);}}>{c.title}</button>)}{!conversations.conversations.length&&<p>Nenhuma conversa disponível para este login.</p>}<button onClick={async()=>{stopVoice();await signOut();window.location.assign("/login?next=%2F");}}><LogOut/>Sair da conta</button></>:FROTA_SUGGESTIONS.map(s=><button key={s.id} onClick={()=>{setDraft(s.description);setPanel(null);}}>{s.title}</button>)}</section>}
 </div></main>;
}

