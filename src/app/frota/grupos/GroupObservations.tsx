"use client";
import {useEffect,useState} from 'react';
import type {OperationalGroup} from '@/lib/frota/operationalGroups';
import type {GroupBinding,GroupObservation} from '@/lib/frota/groupObservation';
const button='min-h-11 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50';
export function GroupObservations({groups}:{groups:OperationalGroup[]}) {
 const [bindings,setBindings]=useState<GroupBinding[]>([]),[events,setEvents]=useState<GroupObservation[]>([]);
 const [canActivate,setCanActivate]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function refresh() {
  const r=await fetch('/api/frota/grupos/observacao',{cache:'no-store'}),d=await r.json();
  if(!r.ok) throw new Error(d.error??'Não foi possível atualizar.');
  setBindings(d.bindings);setEvents(d.events);setCanActivate(d.canActivate);setError('');
 }
 useEffect(()=>{let stopped=false; const update=()=>{if(!stopped && document.visibilityState==='visible') refresh().catch(e=>{if(!stopped)setError(e.message);});};update();const timer=setInterval(update,20000);return()=>{stopped=true;clearInterval(timer);};},[]);
 async function change(registryId:string,action:'activate'|'pause') {
  setBusy(true);setNotice('');setError('');
  try { const r=await fetch('/api/frota/grupos/observacao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({registryId,action})}),d=await r.json();if(!r.ok)throw new Error(d.error);await refresh();setNotice(action==='activate'?'Leitura silenciosa ativada. Somente novas mensagens; nenhuma resposta será enviada ao grupo.':'Leitura pausada. O bloqueio de respostas permanece.'); }
  catch(e){setError(e instanceof Error?e.message:'Falha ao configurar.');}finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border border-border p-5">
  <h2 className="text-lg font-semibold">Leitura silenciosa · conferência no painel</h2>
  <p className="text-sm text-muted-foreground">Sem respostas nos grupos e sem lançamentos automáticos. A interpretação é uma sugestão para revisão, não uma confirmação de registro. Texto, foto e PDF podem ser interpretados; áudio e formatos não suportados aparecem como pendências. Não importa histórico anterior.</p>
  {error&&<p role="alert" className="rounded border border-red-500 p-3">{error}</p>}{notice&&<p role="status" className="rounded border border-emerald-500 p-3">{notice}</p>}
  {groups.filter(g=>!g.archived).map(g=>{const b=bindings.find(b=>b.registry_id===g.id);return <article key={g.id} className="rounded-lg border border-border p-3"><h3 className="font-semibold">{g.name}</h3><p className="my-2 text-sm">{b ? b.enabled?'Observação ativa · sem respostas':'Observação pausada · sem respostas':'Não vinculado — recebimento não ativado'}</p>{b&&<p className="mb-2 text-xs text-muted-foreground">Vinculado em {new Date(b.activated_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>}{canActivate&&<button className={button} disabled={busy} onClick={()=>change(g.id,b?.enabled?'pause':'activate')}>{b?.enabled?'Pausar leitura':'Ativar leitura silenciosa'}</button>}</article>;})}
  <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">O que o Frota IA entendeu</h3><button className={button} disabled={busy} onClick={()=>refresh().catch(e=>setError(e.message))}>Atualizar recebimentos</button></div>
  <p className="text-xs text-muted-foreground">Até 100 recebimentos recentes, com atualização a cada 20 segundos enquanto esta tela estiver visível. Consulte o original no WhatsApp para conferir anexos.</p>
  {!events.length&&!error&&<p className="text-sm">Nenhuma mensagem recebida neste modo até agora.</p>}
  {events.map(event=><article key={event.id} className="space-y-2 rounded-lg border border-border p-4"><p className="font-medium">{groups.find(g=>g.id===event.registry_id)?.name??'Grupo da empresa'} · {event.kind}</p><p className="text-xs text-muted-foreground">{new Date(event.received_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} · {event.sender_name}</p>{event.original_text&&<details><summary className="cursor-pointer text-sm">Mensagem recebida</summary><p className="whitespace-pre-wrap break-words text-sm">{event.original_text}</p></details>}<p className="whitespace-pre-wrap break-words text-sm">{event.status==='processing'?'Interpretação pendente. Se permanecer assim, confira o original e solicite revisão.':event.summary}</p>{event.status==='review'&&<details><summary className="cursor-pointer text-sm">Dados identificados e dúvidas</summary><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(event.evidence,null,2)}</pre></details>}<p className="text-xs text-muted-foreground">Somente observação · nenhum lançamento automático</p></article>)}
 </section>;
}
