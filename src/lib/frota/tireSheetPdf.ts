import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {readFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {treadProjection,tireResult,type TireCaseRow} from "./tireCases";
import {configurationOf,positions,type InventoryRow} from "./tireInventory";
import {tireSheetTimeline,type TireSheetStage} from "./tireSheetTimeline";
import {rigid8x2TirePoint} from "./rigid8x2TireLayout";
const n=(v:number|null|undefined,d=0)=>v==null?"Não informado":v.toLocaleString("pt-BR",{maximumFractionDigits:d});
const date=(s:string)=>s.split('-').reverse().join('/');
type SheetTire={id:string;code:string;dot:string;position:string;product:string;size:string;tread:string};
type Result={codes:string;date:string;distance:number|null;initial:number|null|undefined;depth:number|null|undefined;days:number|null;wear:number|null;kmPerMm:number|null;monthly:number|null;remaining:number|null;months:number|null;total:number|null;limit:number;reference:number|null|undefined;cost:number|null;basis:string};
export type TireSheetData={name:string;plate:string;vehicle:string;segment:string;version:number;layout:"6x4"|"8x2"|"6x2"|"4x2"|"tank"|null;tires:SheetTire[];stages:TireSheetStage[];results:Result[];inventoryNote?:string};
export function caseSheetData(row:TireCaseRow):TireSheetData{
 const c=row.data,v=c.vehicle.toLowerCase();const resultGroups=new Map<string,Result>();
 for(const t of c.tires){const r=treadProjection(t,c.events);if(!r.reading)continue;
 const result:Result={codes:t.code,date:r.reading.date,distance:r.distance,initial:t.initialDepth,depth:r.reading.depth,days:r.days,wear:r.wear,kmPerMm:r.kmPerMm,monthly:r.monthly,remaining:r.remaining,months:r.months,total:r.total,limit:r.limit,reference:t.projectedLifeKm,cost:t.costInformed===false?null:t.cost,basis:r.reading.depthBasis==="conjunto"?"Sulco informado para o conjunto":"Medição conforme registro individual"};
 const key=JSON.stringify({...result,codes:""});const old=resultGroups.get(key);if(old)old.codes+=", "+t.code;else resultGroups.set(key,result);
 }
 return {name:c.client.name,plate:c.plate,vehicle:c.vehicle,segment:c.operation,version:row.version,layout:/8\s*[x×]\s*2/.test(v)?"8x2":/6\s*[x×]\s*2/.test(v)?"6x2":/4\s*[x×]\s*2/.test(v)?"4x2":null,tires:c.tires.map(t=>({id:t.id,code:t.code,dot:t.dot||"Não informado",position:tireResult(t,c.events).position,product:[t.brand,t.model,t.life==="1ª recapagem"?"1º RCP":t.life].filter(Boolean).join(" · "),size:t.size||"Não informada",tread:[t.treadBrand,t.treadModel].filter(Boolean).join(" - ")})),stages:tireSheetTimeline(c.tires,c.events),results:[...resultGroups.values()]};
}
export function inventorySheetData(row:InventoryRow,vehicleId:string):TireSheetData{
 const s=row.data,v=s.vehicles.find(v=>v.id===vehicleId);if(!v)throw Error("Veículo não encontrado");const cfg=configurationOf(v),pp=positions(v),tt=s.tires.filter(t=>t.status==="montado"&&t.vehicleId===v.id),w=cfg.axes.map(a=>a.wheels).join(',');
 const layout=cfg.kind==="caminhao"&&w==="2,4,4"&&/6\s*[x×]\s*4/i.test(cfg.label)?"6x4":cfg.kind==="caminhao"&&w==="2,2,4,4"?"8x2":cfg.kind==="cavalo"?(w==="2,4"?"4x2":w==="2,4,4"?"6x2":null):cfg.body==="tanque"&&cfg.axes.length===4?"tank":null;
 return {name:s.customer.name,plate:v.plate,vehicle:v.model+" · "+cfg.label,segment:v.segment||cfg.label,version:row.version,layout,tires:[...tt].sort((a,b)=>(a.position||"").localeCompare(b.position||"")).map(t=>({id:t.id,code:t.fire,dot:t.dot||"Não informado",position:(()=>{const pos=pp.find(p=>p.id===t.position);return pos?pos.label+(pos.axis>0?" · "+cfg.axes[pos.axis-1].role:""):"Posição não informada";})(),product:[t.brand,t.model,t.life==="1ª recapagem"?"1º RCP":t.life].join(" · "),size:t.size,tread:t.tread})),stages:v.mountingReference?[{label:"Aplicação",date:v.mountingReference.date,km:v.mountingReference.km}]:[],results:[],inventoryNote:`${tt.length} pneus montados · ${s.tires.filter(t=>t.status==="estoque").length} pneus em estoque. Marcação física: ${tt.length&&tt.every(t=>t.marked)?"confirmada":"a confirmar"}.`};
}
export function sheetPoint(layout:TireSheetData['layout'],position:string){
 if(layout==="8x2"){const p=rigid8x2TirePoint(position);return p?{x:p.x/887,y:p.y/1774}:null;}
 const p=position.toLowerCase(),a=p.match(/eixo\s*([1-4])\b/)??p.match(/\b([1-4])[º°o]?\s*eixo/),ax=a?Number(a[1]):0;
 const left=/esquer/.test(p),right=/direit/.test(p),inner=/intern|dentro/.test(p);if(!ax||left===right||!layout)return null;
 if(layout==="6x4")return ax<=3?{x:left?(inner?.28:.21):(inner?.72:.79),y:[.20,.725,.85][ax-1]}:null;
 const ys=layout==="4x2"?[.48,.86]:layout==="6x2"?[.48,.72,.89]:[.39,.50,.62,.74];if(!ys[ax-1])return null;
 return {x:left?(inner?.33:.25):(inner?.67:.75),y:ys[ax-1]};
}
/** Single customer-facing PDF renderer for monitoring and inventory. Never mutates data. */
export async function tireSheetPdf(s:TireSheetData){
 const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 doc.setTitle(`${s.name} · ${s.plate} · Acompanhamento de pneus`);doc.setAuthor("RodoCore Consultoria");
 const col=(hex:string)=>rgb(parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255),ink=col('203745'),muted=col('60737D'),gold=col('BA962C');
 const clean=(v:string)=>v.replace(/[–—]/g,'-').replace(/×/g,'x').replace(/→/g,' para ').replace(/[^\x20-\x7e\xa0-\xff]/g,'');
 let page=doc.addPage([595.28,841.89]),y=0;
 const box=(x:number,top:number,w:number,h:number,c:string)=>page.drawRectangle({x,y:top-h,width:w,height:h,color:col(c)});
 const text=(v:string,x:number,top:number,size=10,b=false,color=ink)=>page.drawText(clean(v),{x,y:top-size,size,font:b?bold:font,color});
 function wrap(v:string,x:number,top:number,w:number,size=10,b=false,color=ink){let line='',yy=top;const f=b?bold:font;for(const char of clean(v)){if(char==='\n'||f.widthOfTextAtSize(line+char,size)>w){text(line,x,yy,size,b,color);yy-=size*1.35;line='';if(char==='\n')continue;}line+=char;}if(line){text(line,x,yy,size,b,color);yy-=size*1.35;}return yy;}
 function header(){box(0,842,596,76,'142D43');text('RODOCORE',28,820,24,true,col('FFFFFF'));text('CONSULTORIA · ACOMPANHAMENTO DE PNEUS',28,784,9,false,col('D7E6EE'));y=wrap('Empresa / Autônomo: '+s.name,28,747,539,15,true)-8;y=wrap(`Placa: ${s.plate}     Marca / Modelo: ${s.vehicle}`,28,y,539,10,true)-5;y=wrap('Segmento: '+(s.segment||'Não informado'),28,y,539,9,false,muted)-12;}
 function next(){page=doc.addPage([595.28,841.89]);header();}
 function room(h:number){if(y-h<52)next();}
 header();
 const assets={"6x4":"mercedes-axor-chassi-6x4.png","8x2":"scania-p-chassi-8x2-v2.png","6x2":"truck.png","4x2":"truck-4x2.webp",tank:"tanker-mapping.png"};
 const image=s.layout?await doc.embedPng(await sharp(await readFile(path.join(process.cwd(),'public/images/tire-cases',assets[s.layout]))).resize({height:1000,withoutEnlargement:true}).png().toBuffer()):null;
 for(const stage of s.stages){room(78);box(28,y,539,20,'E7F3F8');text('SITUAÇÃO REGISTRADA · '+stage.label.toUpperCase(),38,y-4,9,true,col('167D98'));y-=20;box(28,y,539,stage.codes?52:32,'FAF7ED');text(`${date(stage.date)}    Odômetro: ${n(stage.km)} km${stage.depth!=null?`    Sulco: ${n(stage.depth,1)} mm`:''}`,38,y-8,10,true);y-=26;if(stage.codes)y=wrap('Pneus: '+stage.codes.join(', '),38,y,515,8)-4;y-=10;}
 const left=s.tires.filter(t=>/esquer/.test(t.position.toLowerCase())),right=s.tires.filter(t=>!/esquer/.test(t.position.toLowerCase()));
 const groups=Math.max(1,Math.ceil(Math.max(left.length,right.length)/2));
 for(let g=0;g<groups;g++){
 room(245);const top=y,ih=215,iw=image?image.width/image.height*ih:130,ix=(595.28-iw)/2,iy=top-215;
 if(image)page.drawImage(image,{x:ix,y:iy,width:iw,height:ih});else wrap('Ilustração não disponível para esta configuração',238,top-70,120,10);
 for(const [side,list] of [[0,left],[1,right]] as const){for(const [i,t] of list.slice(g*2,g*2+2).entries()){
 const x=side?383:28,cy=top-12-i*118,p=sheetPoint(s.layout,t.position);
 if(p){const sx=side?383:212,sy=cy-49,ex=ix+iw*p.x,ey=iy+ih*(1-p.y),mid=sx+(ex-sx)*.35;page.drawLine({start:{x:sx,y:sy},end:{x:mid,y:sy},color:gold,thickness:1});page.drawLine({start:{x:mid,y:sy},end:{x:ex,y:ey},color:gold,thickness:1});}
 box(x,cy,184,108,'F0F5F8');box(x,cy,3,108,'BA962C');let yy=wrap((t.code===t.dot?'DOT ':'Nº ')+t.code, x+10,cy-8,164,9,true)-3;yy=wrap('DOT: '+t.dot,x+10,yy,164,8)-3;yy=wrap(t.position,x+10,yy,164,8)-3;yy=wrap(t.product,x+10,yy,164,8,true)-3;if(t.tread)yy=wrap(t.tread,x+10,yy,164,8,true)-2;wrap('Medida: '+t.size,x+10,yy,164,8);
 }}
 text('Frente acima · desenho ilustrativo',229,iy-6,7,false,muted);y=iy-30;
 }
 if(!s.results.length){room(86);box(28,y,539,80,'EBF5F0');box(28,y,3,80,'3C816B');text('Aplicação registrada · aguardando primeira inspeção',40,y-10,11,true);wrap(s.inventoryNote||`${s.tires.length} pneus cadastrados. Sulco inicial conforme registro de aplicação.`,40,y-30,510,9);wrap('Rodagem, rendimento por milímetro, média mensal e projeção serão calculados após a inspeção com data, odômetro e sulco medido.',40,y-51,510,9,false,muted);y-=94;}
 for(const r of s.results){room(240);text('RESULTADO REGISTRADO · INSPEÇÃO '+date(r.date),28,y,11,true);y-=19;y=wrap('Pneus: '+r.codes,28,y,539,8,false,muted)-6;
 box(28,y,539,46,'F0F5F8');text('Rodagem registrada',40,y-6,9);text(n(r.distance)+' km',40,y-21,19,true,col('167D98'));text('Sulco inicial / atual',240,y-6,9);text(`${n(r.initial,1)} / ${n(r.depth,1)} mm`,240,y-23,13,true);text('Período acompanhado',410,y-6,9);text(n(r.days)+' dias',410,y-23,13,true);y-=52;
 box(28,y,539,49,'E7F3F8');text('Rendimento por milímetro de borracha',40,y-6,9,true);text(n(r.kmPerMm)+' km/mm',40,y-22,16,true,col('167D98'));text('Rodagem média por mês',320,y-6,9,true);text(n(r.monthly)+' km/mês',320,y-22,16,true,col('167D98'));y-=56;
 y=wrap(`Desgaste: ${n(r.wear,1)} mm · Compra por pneu: ${r.cost==null?'não informada':'R$ '+n(r.cost,2)} · Custo parcial: ${r.cost!=null&&r.distance? 'R$ '+n(r.cost/r.distance,4)+'/km':'sem base'} · ${r.basis}. Mês de 30 dias.`,28,y,539,8,false,muted)-5;
 box(28,y,539,64,'EBF5F0');text('PROJEÇÃO · RODAGEM TOTAL ESTIMADA',40,y-5,9,true);text(r.total==null?'Sem base para estimar':n(r.total)+' km',40,y-19,18,true);text(`Restante: ${n(r.remaining)} km · ${n(r.months,2)} meses`,285,y-24,11,true);text(`Referência comercial: ${n(r.reference)} km · Retirada de referência: ${n(r.limit,1)} mm`,40,y-46,8);y-=74;
 room(30);y=wrap('Projeção referente à inspeção visual e à medição de sulco na data acima. Ainda não é o resultado final. Mantendo o ritmo observado de desgaste e uso, o pneu poderá atingir o total estimado. Atualizar nas próximas inspeções.',28,y,539,8,false,muted)-12;
 }
 doc.getPages().forEach((p,i)=>{p.drawLine({start:{x:28,y:38},end:{x:567,y:38},color:col('DCE5E9')});p.drawText(`RodoCore Consultoria · Revisão ${s.version} · ${i+1} / ${doc.getPageCount()}`,{x:28,y:24,font,size:8,color:muted});});
 return doc.save();
}
