import type { OnboardingCollectedData, OnboardingReply, OnboardingStepResult } from './onboardingConversation';
import type { OnboardingState } from '@/lib/supabase/tables';

export type BaseField = 'name'|'brand'|'model'|'kind'|'formula'|'body'|'cargo'|'plate'|'city';
export interface IndividualBase {
  version: 2;
  step?: BaseField;
  manual?: BaseField;
  model?: string;
  body?: string;
  pending?: { field: BaseField; value: string };
}
const fields: BaseField[] = ['name','brand','model','kind','formula','body','cargo','plate','city'];
const norm = (s:string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const txt = (text:string):OnboardingReply => ({kind:'text',text});
const choices = (text:string, options:string[]):OnboardingReply => ({kind:'list',text,title:'Cadastro do caminhão',buttonLabel:'Escolher',options:options.map(title=>({id:title,title}))});
const ufs = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const stateNames:Record<string,string> = {'acre':'AC','alagoas':'AL','amapa':'AP','amazonas':'AM','bahia':'BA','ceara':'CE','distrito federal':'DF','espirito santo':'ES','goias':'GO','maranhao':'MA','mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','para':'PA','paraiba':'PB','parana':'PR','pernambuco':'PE','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS','rondonia':'RO','roraima':'RR','santa catarina':'SC','sao paulo':'SP','sergipe':'SE','tocantins':'TO'};
function question(f:BaseField,d:OnboardingCollectedData):OnboardingReply {
 if(d.individualBase?.manual===f)return txt('Digite '+({brand:'a marca',formula:'a configuração (ex.: 8x4)',body:'a carroceria',cargo:'o tipo de carga'} as Record<string,string>)[f]+'.');
 switch(f){
 case 'name':return txt('Como posso te chamar?');
 case 'brand':return choices('Qual é a marca do seu caminhão?',['Volvo','Scania','Mercedes-Benz','Volkswagen','DAF','Iveco','Outra']);
 case 'model':return txt('Qual é o modelo do seu caminhão?');
 case 'kind':return {kind:'buttons',text:'Seu caminhão é rígido, tipo truck, ou é cavalo mecânico?',options:[{id:'rigido',label:'Rígido (truck)'},{id:'cavalo',label:'Cavalo mecânico'}]};
 case 'formula':return choices('Qual é a configuração do seu caminhão?',['6×4','6×2','4×2','8×2','Outra']);
 case 'body':return choices(d.vehicleSetup?.kind==='cavalo'?'Qual é a carroceria da carreta que você costuma puxar?':'Qual é a carroceria do seu caminhão?',['Carga seca','Baú','Sider','Tora','Tanque','Outra']);
 case 'cargo':return choices('Que tipo de carga você costuma transportar?',['Carga fracionada','Madeira','Grãos','Combustíveis','Outra']);
 case 'plate':return txt('Qual é a placa do seu caminhão?');
 case 'city':return txt(d.baseCity&&!d.baseState?'Qual é o estado de '+d.baseCity+'?':'De qual cidade e estado você costuma sair? Exemplo: Canoinhas, SC.');
 }
}
function missing(d:OnboardingCollectedData):BaseField|undefined {
 return fields.find(f=> !({name:d.name,brand:d.vehicleBrand,model:d.individualBase?.model,kind:d.vehicleSetup?.kind,formula:d.vehicleSetup?.formula,body:d.individualBase?.body,cargo:d.cargoProfile?.type,plate:d.plate,city:d.baseCity&&d.baseState}[f]));
}
const correctionFields:Record<string,BaseField> = {nome:'name',marca:'brand',modelo:'model',tipo:'kind',configuracao:'formula',carroceria:'body',carga:'cargo',placa:'plate',cidade:'city',origem:'city',estado:'city'};
function save(d:OnboardingCollectedData,f:BaseField,v:string){
 const b=d.individualBase!;
 switch(f){
 case 'name':d.name=v;break;
 case 'brand':d.vehicleBrand=v;break;
 case 'model':b.model=v;break;
 case 'kind':d.vehicleSetup={...d.vehicleSetup,kind:v as 'cavalo'|'caminhao'};break;
 case 'formula':d.vehicleSetup={...d.vehicleSetup,formula:v};break;
 case 'body':b.body=v;d.bodyType=({ 'carga seca':'grade_baixa','bau':'bau','sider':'sider','tanque':'tanque' } as const)[norm(v) as 'bau']??'outro';break;
 case 'cargo':d.cargoProfile={type:v,complete:true};break;
 case 'plate':d.plate=v;d.plateAsked=true;break;
 }
 if(d.vehicleBrand&&b.model)d.primaryVehicleRaw=d.vehicleBrand+' '+b.model;
 if(d.vehicleSetup?.kind&&d.vehicleSetup.formula){
  d.vehicleSetup={...d.vehicleSetup,complete:true,label:`${d.vehicleSetup.kind==='cavalo'?'Cavalo mecânico':'Caminhão rígido'} ${d.vehicleSetup.formula}; eixos do conjunto a confirmar por viagem`};
  d.vehicleType=d.vehicleSetup.kind==='cavalo'?'cavalo_mecanico':d.vehicleSetup.formula?.startsWith('4x')?'toco':'truck';
  // This is a motor configuration, never the axle count of a coupled combination.
  d.axleCount=null;
 }
}
export function processIndividualBase(state:OnboardingState,previous:OnboardingCollectedData,input:string):OnboardingStepResult {
 const d:OnboardingCollectedData={...previous,individualBase:{version:2,...previous.individualBase},vehicleSetup:previous.vehicleSetup?{...previous.vehicleSetup}:undefined};
 const b=d.individualBase!;const t=norm(input);
 const result=(reply:OnboardingReply,nextState:OnboardingState='awaiting_primary_vehicle',finalize=false):OnboardingStepResult=>({reply,nextState,finalize,collectedData:d});
 const next=()=>{delete b.manual;delete b.pending;b.step=missing(d);return b.step?result(question(b.step,d),b.step==='name'?'awaiting_name':'awaiting_primary_vehicle'):result(txt('Cadastro salvo! Você já pode pedir uma análise de frete ou custo. Para alterar uma informação, diga o que deseja corrigir.'),'completed',true);};
 if(/^(pausar|cancelar|continuar depois|depois eu continuo)$/.test(t))return result(txt('Tudo bem. Seu progresso fica salvo. Quando voltar, continuamos de onde parou.'),'paused');
 if(state==='paused'||/^(oi|ola|continuar|retomar|voltei)[!.]*$/.test(t)){b.step=missing(d);return b.step?result(question(b.step,d),b.step==='name'?'awaiting_name':'awaiting_primary_vehicle'):next();}
 const correction=t.match(/^corrigir(?: (.+))?$/);
 if(correction){const f=correctionFields[correction[1]];if(!f)return result(txt('Qual dado quer corrigir? Escreva, por exemplo, corrigir placa ou corrigir marca.'));b.step=f;delete b.manual;delete b.pending;if(f==='city'){delete d.baseCity;delete d.baseState;}return result(question(f,d));}
 const f=b.step??missing(d);
 if(!f)return next();
 if(b.pending){if(/^(sim|confirmar|correto)$/.test(t)){save(d,b.pending.field,b.pending.value);return next();}if(/^(nao|corrigir)$/.test(t)){delete b.pending;return result(question(f,d));}return result(txt('Confirma '+b.pending.value+'? Responda sim ou não.'));}
 if(!t||/^(nao sei|talvez|tanto faz)$/.test(t))return result(question(f,d));
 if(['brand','formula','body','cargo'].includes(f)&&/^(outr[oa]|outr[oa]s)$/.test(t)){b.manual=f;return result(question(f,d));}
 let value=input.trim().slice(0,120);
 if(f==='name') {if(value.length<2||/\d/.test(value))return result(question(f,d),'awaiting_name');}
 if(f==='brand'){
  const brands=[[/\bvolvo\b/,'Volvo'],[/\bscania\b/,'Scania'],[/mercedes|\bmb\b/,'Mercedes-Benz'],[/volks|\bvw\b/,'Volkswagen'],[/\bdaf\b/,'DAF'],[/\biveco\b/,'Iveco']] as const;
  const hits=brands.filter(([r])=>r.test(t));if(hits.length>1)return result(txt('Qual dessas marcas é a do caminhão que vamos cadastrar?'));
  if(hits.length)value=hits[0][1];else if(!/^[\p{L}\d .-]{2,60}$/u.test(value))return result(question(f,d));
 }
 if(f==='kind'){
  const rigid=/rigido|truck|truque|toco|trucado|bitruck|3\/4/.test(t),horse=/cavalo/.test(t);
  if(rigid===horse)return result(question(f,d));value=horse?'cavalo':'caminhao';
 }
 if(f==='formula'){
  const matches=[...t.matchAll(/\b(4|6|8|10)\s*(?:x|×|por)\s*(2|4|6|8)\b/g)];
  if(matches.length!==1)return result(txt('Informe uma configuração, por exemplo 6x4 ou 4x2.'));
  value=matches[0][1]+'x'+matches[0][2];
 }
 if(f==='body'||f==='cargo'){
  if(f==='cargo'&&/^(tanque|bau|sider|tora)$/.test(t))return result(txt('Essa é a carroceria. Que mercadoria você transporta? Ex.: combustíveis ou madeira.'));
  if(/\bou\b|\?/.test(t)){return result(txt('Qual informação devo salvar? Pode indicar uma ou dizer que trabalha com cargas diversas.'));}
 }
 if(f==='plate'){value=value.toUpperCase().replace(/[\s-]/g,'');if(!/^[A-Z]{3}\d[\dA-Z]\d{2}$/.test(value))return result(txt('Confira a placa. Exemplo: ABC-1234 ou ABC1D23.'));}
 if(f==='city'){
  const uf=ufs.includes(t.toUpperCase())?t.toUpperCase():stateNames[t];
  if(d.baseCity&&!d.baseState&&uf){d.baseState=uf;return next();}
  const match=value.match(/^(.+?)[\s,\/-]+([A-Za-z]{2})$/);
  if(match&&ufs.includes(match[2].toUpperCase())){d.baseCity=match[1].trim();d.baseState=match[2].toUpperCase();return next();}
  const full=Object.keys(stateNames).sort((a,b)=>b.length-a.length).find(s=>t.endsWith(', '+s)||t.endsWith(' - '+s));
  if(full){d.baseCity=value.slice(0,value.length-full.length).replace(/[ ,\/-]+$/,'');d.baseState=stateNames[full];return next();}
  if(d.baseCity&&!d.baseState)return result(txt('Informe a sigla ou o nome do estado. Exemplo: SC ou Santa Catarina.'));
  if(value.length<2||/\d|\bou\b|\?/.test(t))return result(question(f,d));
  d.baseCity=value;return result(question(f,d));
 }
 // Free-form values are confirmed when they look like a question/alternative.
 if(/\bou\b|\?/.test(t)){b.pending={field:f,value};return result(txt('Você quer cadastrar “'+value+'”? Responda sim ou não.'));}
 save(d,f,value);return next();
}

