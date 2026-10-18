import { z } from "zod";

const text = z.string().trim().max(200);
const km = z.number().finite().min(0).max(10000000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Data inválida");
export const caseSchema = z.object({
  client: z.object({ name:text.min(2), document:text, address:z.string().trim().max(500), phone:z.string().regex(/^[+\d ()-]{0,30}$/) }).strict(),
  plate:text.min(7).max(12), vehicle:text, operation:text,
  baseline:z.object({ product:text, cost:z.number().finite().min(0).max(10000000), distance:km, basis:z.enum(["medido","estimado","parcial"]), notes:z.string().max(1000) }).strict(),
  tires:z.array(z.object({ id:z.string().uuid(), code:text.min(1), product:text.min(1), brand:text, model:text, size:text,
    life:z.enum(["Novo","1ª recapagem","2ª recapagem","Outra"]), position:text.min(1), mountedAt:date, mountedKm:km,
    cost:z.number().finite().min(0).max(10000000), targetKm:km.nullable(), advice:z.string().max(2000),
    initialDepth:z.number().finite().positive().max(50).nullable().optional(), retirementDepth:z.number().finite().min(1.6).max(50).optional(), projectedLifeKm:km.nullable().optional()
  }).strict()).min(1).max(24),
  events:z.array(z.object({ id:z.string().uuid(), tireId:z.string().uuid(), date, km,
    type:z.enum(["Leitura","Rodízio","Inspeção","Retirada"]), position:text, notes:z.string().max(2000),
    evidence:z.array(z.string().uuid()).max(6), depth:z.number().finite().min(0).max(50).nullable().optional(), depthBasis:z.enum(["individual","conjunto"]).optional(), twi:z.boolean().optional()
  }).strict()).max(500),
  notes:z.string().max(3000)
}).strict().superRefine((v,ctx)=>{
  const ids=new Set(v.tires.map(t=>t.id));
  if(ids.size!==v.tires.length || new Set(v.tires.map(t=>t.code.toLowerCase())).size!==v.tires.length) ctx.addIssue({code:"custom",message:"Identifique cada pneu sem repetir código."});
  if(new Set(v.events.map(e=>e.id)).size!==v.events.length) ctx.addIssue({code:"custom",message:"Evento duplicado."});
  for(const e of v.events) if(!ids.has(e.tireId)) ctx.addIssue({code:"custom",message:"Leitura sem pneu correspondente."});
  for(const t of v.tires){
    if(t.initialDepth!=null && (t.retirementDepth??1.6)>=t.initialDepth)ctx.addIssue({code:"custom",message:"Sulco inicial deve superar a referência de retirada."});
    if(t.targetKm!==null && t.targetKm<=t.mountedKm) ctx.addIssue({code:"custom",message:"O km da próxima revisão deve ser maior que o da montagem."});
    let previous=t.mountedKm; let removed=false;
    for(const e of v.events.filter(e=>e.tireId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km)){
      if(e.depth!=null&&t.initialDepth!=null&&e.depth>t.initialDepth)ctx.addIssue({code:"custom",message:"Sulco medido não pode superar o sulco inicial desta vida."});
      if(e.date<t.mountedAt || e.km<previous || removed) ctx.addIssue({code:"custom",message:"Revise datas e km: leituras devem avançar e não podem seguir uma retirada."});
      previous=e.km; removed=e.type==="Retirada";
    }
  }
});
export function treadProjection(t:TireCase["tires"][number],events:TireCase["events"]){
 const ordered=events.filter(e=>e.tireId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km);
 const reading=ordered.at(-1);const distance=reading?reading.km-t.mountedKm:null;
 const days=reading?(Date.parse(reading.date)-Date.parse(t.mountedAt))/86400000:null;
 const limit=t.retirementDepth??1.6;
 const reached=!!reading&&(reading.twi===true||reading.type==="Retirada"||(reading.depth!=null&&reading.depth<=limit));
 const wear=t.initialDepth!=null&&reading?.depth!=null?t.initialDepth-reading.depth:null;
 const kmPerMm=wear!==null&&wear>0&&distance!==null&&distance>0?distance/wear:null;
 const remaining=reached?0:kmPerMm!==null&&reading?.depth!=null?kmPerMm*Math.max(0,reading.depth-limit):null;
 const monthly=days!==null&&days>0&&distance!==null&&distance>0?distance/days*30:null;
 const months=remaining!==null&&monthly!==null?remaining/monthly:null;
 const total=distance!==null&&remaining!==null?distance+remaining:null;
 const status=reached?"retirada":total===null||!t.projectedLifeKm?"sem-base":total<t.projectedLifeKm?"abaixo":"dentro";
 return {reading,distance,days,limit,wear,kmPerMm,remaining,monthly,months,total,status};
}
export type TireCase = z.infer<typeof caseSchema>;
export type TireCaseRow = { id:string; company_id:string; actor_id:string; version:number; data:TireCase; created_at:string; updated_at:string };
export function tireResult(t:TireCase["tires"][number],events:TireCase["events"]){
  const readings=events.filter(e=>e.tireId===t.id).sort((a,b)=>a.date.localeCompare(b.date)||a.km-b.km);
  const last=readings.at(-1); const distance=last?last.km-t.mountedKm:null;
  return { distance, cpk:distance!==null&&distance>0?t.cost/distance:null, closed:last?.type==="Retirada", position:[...readings].reverse().find(e=>e.position)?.position||t.position,
    remaining:t.targetKm!==null?t.targetKm-(last?.km??t.mountedKm):null };
}
export function comparison(c:TireCase,t:TireCase["tires"][number]){
  const r=tireResult(t,c.events); const baseline=c.baseline.distance>0?c.baseline.cost/c.baseline.distance:null;
  return {...r,baseline,comparable:r.closed&&c.baseline.basis==="medido"&&baseline!==null&&baseline>0,
    difference:baseline!==null&&baseline>0&&r.cpk!==null?(baseline-r.cpk)/baseline*100:null};
}
export function privateCaseAllowed(email:string|undefined,confirmed:string|undefined,role:string,companyId:string,configuredId:string|undefined){
  return !!confirmed && email?.toLowerCase()==="rafaelkamosaquario@gmail.com" && role==="owner" && !!configuredId && companyId===configuredId;
}
