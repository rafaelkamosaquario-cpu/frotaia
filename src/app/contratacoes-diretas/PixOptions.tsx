"use client";
import {useState} from "react";
import {MANUAL_PIX_KEY} from "@/lib/mercadopago/manualPix";
import {formatarReais} from "@/lib/mercadopago/catalog";
export function PixOptions({code,cents}:{code:string;cents:number}) {
 const [notice,setNotice]=useState(""),[qr,setQr]=useState<{code:string;url:string}|null>(null),[busy,setBusy]=useState(false);
 async function copy(text:string,label:string){try{await navigator.clipboard.writeText(text);setNotice(label+" copiado. Envie em uma mensagem separada ao cliente.");}catch{setNotice("Selecione o campo e copie manualmente.");}}
 async function generate(){setBusy(true);setNotice("");try{const QRCode=await import("qrcode");const url=await QRCode.toDataURL(code,{width:640,margin:4,errorCorrectionLevel:"M",color:{dark:"#000000",light:"#ffffff"}});setQr({code,url});}catch{setNotice("Não foi possível gerar o QR Code. Use o Copia e Cola ou a chave.");}finally{setBusy(false);}}
 return <section className="space-y-4 rounded-lg border p-4" aria-label="Formas de pagar por Pix">
 <h3 className="font-semibold">Escolha como enviar o Pix · {formatarReais(cents)}</h3>
 <p>Envie a apresentação do plano e, depois, uma das opções abaixo em mensagem separada. Todas usam a mesma chave.</p>
 <label className="block">1. Somente Pix Copia e Cola<textarea className="mt-1 min-h-24 w-full rounded border bg-background p-3 font-mono text-sm" readOnly value={code}/></label>
 <button type="button" className="rounded border p-3" onClick={()=>copy(code,"Pix Copia e Cola")}>Copiar somente o código Pix</button>
 <div><p>2. QR Code do Pix, com valor preenchido</p><button type="button" className="rounded border p-3" disabled={busy} onClick={generate}>{busy?"Gerando…":"Mostrar QR Code"}</button>
 {qr?.code===code&&<div className="mt-3 space-y-3"><img src={qr.url} alt={"QR Code Pix de "+formatarReais(cents)} width={320} height={320} className="max-w-full rounded bg-white"/><a className="inline-block rounded border p-3" href={qr.url} download={"Frota-IA-Pix-"+cents+".png"}>Baixar QR Code para enviar</a></div>}</div>
 <label className="block">3. Chave Pix · celular<input className="mt-1 block w-full rounded border bg-background p-3" readOnly value={MANUAL_PIX_KEY}/></label>
 <button type="button" className="rounded border p-3" onClick={()=>copy(MANUAL_PIX_KEY,"Chave Pix")}>Copiar somente a chave Pix</button>
 <p className="text-sm">Ao usar a chave, informe o valor de {formatarReais(cents)} no banco. Código e QR Code já levam o valor. Confira o recebedor antes de pagar. O QR Code é gerado aqui, sem serviço externo.</p>
 {notice&&<p role="status">{notice}</p>}
 </section>;
}
