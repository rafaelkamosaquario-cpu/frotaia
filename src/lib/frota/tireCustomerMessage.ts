import type {TireSheetStage} from './tireSheetTimeline';

/** Customer message uses saved installation readings, never today's odometer. */
export function tireCustomerMessage({name,plate,vehicle,stages,traction}:{name:string;plate:string;vehicle:string;stages:TireSheetStage[];traction:boolean}){
 const n=(v:number)=>v.toLocaleString('pt-BR',{maximumFractionDigits:1});
 const applications=stages.filter(s=>s.label==='Aplicação');
 const lines=[`Olá, ${name}!`, '', 'Segue em anexo o PDF do mapeamento e acompanhamento de pneus da RodoCore.', '', `Veículo: ${vehicle}`, `Placa: ${plate}`];
 for(const s of applications){
  lines.push('',`Data da instalação: ${s.date.split('-').reverse().join('/')}`);
  if(s.codes?.length)lines.push(`Pneus: ${s.codes.join(', ')}`);
  if(Number.isFinite(s.km))lines.push(`Odômetro na instalação: ${n(s.km)} km`);
  if(s.depth!=null&&Number.isFinite(s.depth))lines.push(`Sulco inicial: ${n(s.depth)} mm`);
 }
 if(traction&&applications.length){
  lines.push('', 'Sugestão de acompanhamento:', '• Rodízio dos pneus de tração em X após aproximadamente 35.000 a 40.000 km da instalação.');
  for(const s of applications){if(!Number.isFinite(s.km))continue;
   if(applications.length>1)lines.push(`Aplicação de ${s.date.split('-').reverse().join('/')}${s.codes?.length?` — pneus ${s.codes.join(', ')}`:''}:`);
   lines.push(`Faixa do odômetro para o rodízio: ${n(s.km+35000)} a ${n(s.km+40000)} km.`, `Cálculo: ${n(s.km)} + 35.000 = ${n(s.km+35000)} km; ${n(s.km)} + 40.000 = ${n(s.km+40000)} km.`);
  }
 }
 lines.push('','• Sugestão: conferir a calibragem dos pneus uma vez a cada 15 dias.','','RodoCore: inteligência que move frotas.');
 return lines.join('\n');
}