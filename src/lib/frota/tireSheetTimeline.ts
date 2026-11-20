import type {TireCase} from "./tireCases";
export type TireSheetStage={label:string;date:string;km:number;depth?:number|null;codes?:string[]};

/** Keep each tire's inspection sequence, merging only equal observations. */
export function tireSheetTimeline(tires:TireCase["tires"],events:TireCase["events"]):TireSheetStage[]{
 const grouped=new Map<string,TireSheetStage>();
 function add(stage:TireSheetStage,code:string){
  const key=JSON.stringify([stage.label,stage.date,stage.km,stage.depth??null]);
  const previous=grouped.get(key);
  if(previous)previous.codes!.push(code);else grouped.set(key,{...stage,codes:[code]});
 }
 for(const t of tires){
  add({label:"Aplicação",date:t.mountedAt,km:t.mountedKm,depth:t.initialDepth},t.code);
  let inspection=0;
  for(const e of events.filter(e=>e.tireId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km)){
   const label=e.type==="Inspeção"?`${++inspection}ª inspeção`:e.type;
   add({label,date:e.date,km:e.km,depth:e.depth},t.code);
  }
 }
 return [...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km||Number(b.label==="Aplicação")-Number(a.label==="Aplicação")).map(s=>({...s,codes:s.codes?.length===tires.length?undefined:s.codes}));
}
