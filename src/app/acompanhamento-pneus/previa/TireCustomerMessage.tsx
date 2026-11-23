"use client";
import {useRef,useState} from 'react';

export function TireCustomerMessage({initialMessage}:{initialMessage:string}){
 const [message,setMessage]=useState(initialMessage),[notice,setNotice]=useState('');
 const field=useRef<HTMLTextAreaElement>(null);
 async function copy(){
  try{await navigator.clipboard.writeText(message);setNotice('Mensagem copiada. Cole na conversa do cliente após anexar o PDF.');}
  catch{field.current?.focus();field.current?.select();setNotice('Não foi possível copiar automaticamente. O texto está selecionado para você copiar.');}
 }
 return <details className="rounded-lg border border-border p-3">
  <summary className="cursor-pointer text-sm font-semibold">Mensagem para o cliente</summary>
  <label className="mt-3 block text-sm">Mensagem para acompanhar o PDF
   <textarea ref={field} className="mt-2 block w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground" rows={12} value={message} onChange={e=>{setMessage(e.target.value);setNotice('');}}/>
  </label>
  <p className="my-2 text-xs text-muted-foreground">Revise as sugestões antes de enviar. A edição vale para esta mensagem; não altera a ficha. Ao trocar de cliente, o texto é atualizado.</p>
  <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!message.trim()} onClick={()=>void copy()}>Copiar mensagem</button>
  {notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}
 </details>;
}