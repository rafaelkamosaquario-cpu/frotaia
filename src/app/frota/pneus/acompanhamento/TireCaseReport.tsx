"use client";
import {useState} from "react";
import {treadProjection,type TireCaseRow} from "@/lib/frota/tireCases";
const n=(v:number|null|undefined,d=0)=>v==null?"Sem dados":v.toLocaleString("pt-BR",{maximumFractionDigits:d});
const date=(v:string|undefined)=>v?v.split('-').reverse().join('/'):"Sem leitura";
const btn="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-40";
export function TireCaseReport({row}:{row:TireCaseRow}){
 const [images,setImages]=useState<string[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const c=row.data;
 const message=`RodoCore | Acompanhamento de pneus\n${c.client.name} - ${c.plate}\nSegue a ficha com as datas das inspeções, montagem, posições e resultados registrados. As projeções são estimativas e serão atualizadas nas próximas inspeções. Não constituem garantia de duração ou segurança.`;
 async function generate(){setBusy(true);setNotice('');try{
  const truck=new Image();truck.src='/images/tire-cases/truck.png';await truck.decode();const output:string[]=[];
  for(let offset=0;offset<c.tires.length;offset+=4){
   const group=c.tires.slice(offset,offset+4),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1697;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível desenhar a ficha.');
   const ink='#122b43',muted='#536a7e';
   const rect=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
   const text=(s:string,x:number,y:number,size=22,color=ink,bold=false)=>{ctx.fillStyle=color;ctx.font=`${bold?'700':'400'} ${size}px Arial`;ctx.fillText(s,x,y);};
   const wrap=(s:string,x:number,y:number,width:number,size=20,color=muted)=>{let line='';ctx.font=`400 ${size}px Arial`;for(const word of s.split(' ')){const candidate=line?line+' '+word:word;if(ctx.measureText(candidate).width>width&&line){text(line,x,y,size,color);y+=size*1.3;line=word;}else line=candidate;}text(line,x,y,size,color);return y+size*1.3;};
   rect(0,0,1200,1697,'white');rect(0,0,1200,140,ink);text('RODOCORE',50,60,34,'white',true);text('CONSULTORIA · ACOMPANHAMENTO DE PNEUS',50,103,19,'#b4d4e9');text('FROTA IA',940,60,30,'#62ccf5',true);text('PAINEL WEB',940,100,21,'#b4d4e9');
   wrap(c.client.name,50,187,1100,29,ink);wrap(`${c.plate} | ${c.vehicle}`,50,237,1100,22,ink);wrap(c.operation,50,282,1100,19);
   rect(50,310,1100,55,'#e8f3fa');text('REGISTRO SALVO · DATAS DE INSPEÇÃO INDICADAS POR PNEU',70,345,21,'#087eae',true);
   ctx.drawImage(truck,65,390,195,292);text('Ilustração genérica',65,711,17,muted);
   group.forEach((t,i)=>{const x=370+(i%2)*390,y=420+Math.floor(i/2)*135;const r=treadProjection(t,c.events);ctx.beginPath();ctx.arc(x,y,31,0,Math.PI*2);ctx.fillStyle='#f4c952';ctx.fill();ctx.strokeStyle='#86620d';ctx.lineWidth=2;ctx.stroke();for(let j=0;j<16;j++){const a=j*Math.PI/8;ctx.beginPath();ctx.moveTo(x+26*Math.cos(a),y+26*Math.sin(a));ctx.lineTo(x+30*Math.cos(a+.07),y+30*Math.sin(a+.07));ctx.stroke();}ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();ctx.stroke();text(String(offset+i+1),x-7,y+6,16,ink,true);wrap(t.code,x+48,y-5,275,21,ink);wrap(r.reading?.position||t.position,x+48,y+24,275,18);});
   wrap('Amarelo: pneu acompanhado. Posições conforme cadastro; a ilustração não confirma a configuração de eixos. Identificação provisória deve ser conferida.',330,685,810,18);
   group.forEach((t,i)=>{const y=770+i*170,r=treadProjection(t,c.events);rect(50,y,1100,158,i%2?'#f5f8fa':'#eaf1f6');
    wrap(`${t.code} | ${t.product}`,65,y+27,1070,21,ink);
    text(`Montagem: ${date(t.mountedAt)} · ${n(t.mountedKm)} km`,65,y+59,18);text(`Leitura: ${date(r.reading?.date)} · ${n(r.reading?.km)} km`,620,y+59,18);
    text(`Rodagem: ${n(r.distance)} km · ${n(r.days)} dias`,65,y+88,18);text(`Sulco: ${n(t.initialDepth,1)} → ${n(r.reading?.depth,1)} mm (${r.reading?.depthBasis||'origem não informada'})`,620,y+88,18);
    text(`Rendimento: ${n(r.kmPerMm)} km/mm`,65,y+116,18);text(`Estimativa restante: ${n(r.remaining)} km · ${n(r.months,2)} meses`,620,y+116,18);
    const label=r.status==='retirada'?'Retirada indicada':r.status==='abaixo'?'Projeção abaixo da expectativa':r.status==='dentro'?'Projeção dentro da expectativa':'Sem base para avaliar desempenho';
    text(`${label} · Total projetado: ${n(r.total)} km · Meta: ${n(t.projectedLifeKm)} km`,65,y+145,17,r.status==='abaixo'||r.status==='retirada'?'#9b2732':'#235d46');
   });
   wrap('Projeção linear a partir do desgaste e ritmo observados, contada da data da leitura de cada pneu. Não representa vida final comprovada nem garantia de segurança. Medições do conjunto não são medições individuais.',50,1490,1100,20);
   wrap('Referência mínima de retirada: 1,6 mm; o limite cadastrado pode ser maior. TWI, danos ou avaliação técnica podem exigir retirada anterior.',50,1570,1100,18);
   text(`RodoCore / Frota IA Painel Web · Revisão ${row.version} · Página ${offset/4+1}/${Math.ceil(c.tires.length/4)}`,50,1650,18,ink,true);output.push(canvas.toDataURL('image/png'));
  }
  setImages(output);setNotice('Ficha gerada a partir do cadastro salvo. Confira antes de compartilhar.');
 }catch(e){setNotice(e instanceof Error?e.message:'Falha ao gerar ficha.');}finally{setBusy(false);}}
 const download=(url:string,name:string)=>{let target=url;if(url.startsWith('data:image/png;base64,')){const data=atob(url.split(',')[1]),bytes=Uint8Array.from(data,ch=>ch.charCodeAt(0));target=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));setTimeout(()=>URL.revokeObjectURL(target),30000);}const a=document.createElement('a');a.href=target;a.download=name;document.body.append(a);a.click();a.remove();};
 async function pdf(){setBusy(true);try{const {PDFDocument}=await import('pdf-lib');const doc=await PDFDocument.create();for(const url of images){const img=await doc.embedPng(url);doc.addPage([595.28,841.89]).drawImage(img,{x:0,y:0,width:595.28,height:841.89});}const bytes=await doc.save();const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));download(url,`${c.plate}-acompanhamento-rev${row.version}.pdf`);setTimeout(()=>URL.revokeObjectURL(url),30000);}catch{setNotice('Falha no PDF. Baixe as imagens ou tente novamente.');}finally{setBusy(false);}}
 async function share(){try{const files=await Promise.all(images.map(async(url,i)=>new File([await (await fetch(url)).blob()],`${c.plate}-pneus-${i+1}.png`,{type:'image/png'})));if(!navigator.canShare?.({files})){setNotice('Baixe a imagem ou PDF e anexe no WhatsApp. Este navegador não compartilha arquivos.');return;}await navigator.share({files,title:'Acompanhamento de pneus',text:message});setNotice('Compartilhamento entregue ao aparelho; confirme o envio no aplicativo.');}catch{setNotice('Compartilhamento cancelado ou indisponível. Nenhum envio confirmado.');}}
 return <section className="rounded-xl border border-border p-4 space-y-3"><h2 className="font-semibold">Ficha visual para o cliente</h2><button disabled={busy} className={btn} onClick={()=>void generate()}>Gerar relatório para o cliente</button>{images.length>0&&<><div className="flex flex-wrap gap-2"><button className={btn} disabled={busy} onClick={()=>void pdf()}>Baixar PDF visual</button><button className={btn} disabled={busy} onClick={()=>void share()}>Compartilhar arquivo</button><button className={btn} onClick={async()=>{try{await navigator.clipboard.writeText(message);setNotice('Mensagem copiada. Anexe o arquivo na conversa.');}catch{setNotice('Copie a mensagem exibida abaixo.');}}}>Copiar mensagem</button></div>{images.map((src,i)=><div key={src.slice(-60)+i}><button className={btn} onClick={()=>download(src,`${c.plate}-pneus-${i+1}.png`)}>Baixar imagem {i+1}</button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src} alt={`Ficha visual - página ${i+1}`} className="w-full max-w-2xl mt-3"/></div>)}<textarea readOnly value={message} aria-label="Mensagem para o cliente" className="w-full border border-border rounded-lg p-3 bg-surface" rows={5}/></>}{notice&&<p role="status">{notice}</p>}<p className="text-sm text-muted-foreground">Nenhum envio automático. Ficha somente dos dados salvos; não divulga endereço ou contato privado. O PDF técnico abaixo contém histórico e dados cadastrais: confira antes de enviar.</p></section>;
}
