import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {comparison,type TireCaseRow} from "./tireCases";
export async function tireCasePdf(row:TireCaseRow){
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 let page=doc.addPage([595,842]),y=780;
 const clean=(s:string)=>s.replace(/[–—]/g,"-").replace(/[^\x20-\x7e\xa0-\xff]/g,"?");
 function line(value:string,heading=false){
  const size=heading?13:10;const f=heading?bold:font;
  const words=clean(value).split(/\s+/);let current="";
  const draw=()=>{if(y<60){page=doc.addPage([595,842]);y=780;}page.drawText(current,{x:44,y,size,font:f,color:heading?rgb(.05,.3,.55):rgb(.12,.16,.2)});y-=size+8;};
  for(const word of words){if(f.widthOfTextAtSize(`${current} ${word}`,size)>500&&current){draw();current="";} // Long identifiers wrap safely.
   for(const char of (current?" ":"")+word){if(f.widthOfTextAtSize(current+char,size)>500){draw();current="";}current+=char;}}
  if(current)draw();
 }
 const c=row.data;
 line("RODOCORE CONSULTORIA | FROTA IA PAINEL WEB",true);line("Acompanhamento de pneus - registro técnico de campo",true);
 line(`Registro ${row.id} | Revisão ${row.version} | Emitido em ${new Date().toLocaleDateString("pt-BR")}`);
 line(`Cliente: ${c.client.name} | Documento: ${c.client.document||"Não informado"}`);
 line(`Endereço: ${c.client.address||"Não informado"} | Contato: ${c.client.phone||"Não informado"}`);
 line(`Veículo: ${c.vehicle||"Não informado"} | Placa: ${c.plate} | Operação: ${c.operation||"Não informada"}`);
 line("Mapa de montagem - posições informadas pelo responsável",true);
 for(const t of c.tires){
  if(y<110){page=doc.addPage([595,842]);y=780;}
  const cy=y-12;
  page.drawCircle({x:61,y:cy,size:16,color:rgb(.96,.79,.32),borderColor:rgb(.45,.34,.12),borderWidth:1});
  page.drawCircle({x:61,y:cy,size:8,color:rgb(1,1,1),borderColor:rgb(.45,.34,.12),borderWidth:1});
  for(let i=0;i<12;i++){const a=i*Math.PI/6;page.drawLine({start:{x:61+13*Math.cos(a),y:cy+13*Math.sin(a)},end:{x:61+16*Math.cos(a+.06),y:cy+16*Math.sin(a+.06)},thickness:1,color:rgb(.45,.34,.12)});}
  y-=40;line(`${t.code} -> ${t.position} | ${t.product} | ${t.life}`);
 }
 line("Pneus em amarelo: incluídos neste acompanhamento. Posições conforme cadastro; cor não atesta desempenho ou segurança.");
 for(const t of c.tires){
  y-=12;const r=comparison(c,t);line(`PNEU ${t.code} - ${t.product}`,true);
  line(`Marca/modelo: ${t.brand} ${t.model} | Medida: ${t.size} | Vida: ${t.life}`);
  line(`Montagem: ${t.mountedAt} | Hodômetro: ${t.mountedKm.toLocaleString("pt-BR")} km | Posição inicial: ${t.position}`);
  line(`Custo desta vida: R$ ${t.cost.toFixed(2)} | Distância acompanhada: ${r.distance??"Sem leitura"} km`);
  line(`CPK ${r.closed?"da vida encerrada":"parcial (vida em andamento)"}: ${r.cpk===null?"Não calculável":`R$ ${r.cpk.toFixed(4)}/km`}`);
  line(`Referência anterior: ${c.baseline.product||"Não informada"} | ${c.baseline.basis} | CPK: ${r.baseline===null?"Não calculável":`R$ ${r.baseline.toFixed(4)}/km`}`);
  if(r.difference!==null)line(`Diferença de CPK: ${r.difference.toFixed(1)}% ${r.comparable?"(vidas encerradas informadas; conferir equivalência da aplicação)":"(comparação provisória, não comprova economia final)"}`);
  line(`Próxima revisão no hodômetro: ${t.targetKm??"Não definida"} km. Orientação: ${t.advice||"A definir pelo responsável."}`);
  for(const e of c.events.filter(e=>e.tireId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km))line(`${e.date} | ${e.type} | ${e.km} km | ${e.position||r.position} | ${e.notes} | ${e.evidence.length} foto(s) vinculada(s)`);
 }
 line(`Observações: ${c.notes||"Nenhuma."}`);line("Documento de acompanhamento, não laudo pericial. Leituras e posições são informadas e devem ser conferidas. Intervalos de serviço dependem da aplicação e orientação técnica. Não é garantia de desempenho.");
 line("Responsável pelo acompanhamento: Rafael Scheffer - RodoCore Consultoria. Identificação institucional; não constitui assinatura digital.");
 doc.getPages().forEach((p,i)=>p.drawText(`RodoCore / Frota IA | ${i+1}/${doc.getPageCount()}`,{x:44,y:28,size:9,font}));
 return doc.save();
}
