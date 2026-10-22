import {z} from "zod";

const text=z.string().trim().max(160);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Data inválida");
const uuid=z.string().uuid();
export const customerSchema=z.object({name:text.min(2),document:text,address:z.string().trim().max(500),phone:text}).strict();
export const vehicleSchema=z.object({id:uuid,plate:text.min(7).max(12).transform(v=>v.toUpperCase().replace(/[^A-Z0-9]/g,"")),model:text.min(1),layout:z.enum(["cavalo6x2","tanque4"]),spares:z.number().int().min(0).max(2)}).strict();
const identity=z.object({fire:text.max(30),dot:text.max(30),serial:text.max(80),marked:z.boolean()}).strict();
const product=z.object({brand:text.min(1),model:text.min(1),size:text.min(1),tread:text,life:z.enum(["Novo","1ª recapagem","2ª recapagem","Outra"])}).strict();
export const commandSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("customer"),customer:customerSchema}).strict(),
 z.object({type:z.literal("vehicle"),vehicle:vehicleSchema}).strict(),
 z.object({type:z.literal("batch"),product,date,tires:z.array(identity).min(1).max(100)}).strict(),
 z.object({type:z.literal("identity"),tireId:uuid,identity}).strict(),
 z.object({type:z.literal("move"),tireId:uuid,date,km:z.number().finite().min(0).max(10000000).nullable(),reason:text.min(2),destination:z.enum(["estoque","montado","servico","baixado"]),vehicleId:uuid.nullable(),position:text.nullable()}).strict()
]);
export type Command=z.infer<typeof commandSchema>;
export type Vehicle=z.infer<typeof vehicleSchema>;
export type Customer=z.infer<typeof customerSchema>;
export type Tire=z.infer<typeof identity>&z.infer<typeof product>&{id:string;status:"estoque"|"montado"|"servico"|"baixado";vehicleId:string|null;position:string|null;createdDate:string};
export type Movement={id:string;tireId:string;date:string;recordedAt:string;from:string;to:string;reason:string;km:number|null;vehicleId:string|null;position:string|null};
export type Inventory={customer:Customer;vehicles:Vehicle[];tires:Tire[];movements:Movement[]};
export type InventoryRow={id:string;company_id:string;actor_id:string;source_case_id:string|null;version:number;data:Inventory;created_at:string;updated_at:string};
export function positions(v:Vehicle){
 const axes=v.layout==="cavalo6x2"?[["DE","DD"],["EE","EI","DI","DE"],["EE","EI","DI","DE"]]:Array.from({length:4},()=>["EE","EI","DI","DE"]);
 return axes.flatMap((s,i)=>s.map((side,j)=>({id:`E${i+1}-P${j+1}`,label:`${i+1}º eixo · ${s.length===2?(j===0?"esquerdo":"direito"):["esquerdo externo","esquerdo interno","direito interno","direito externo"][j]}`,axis:i+1,side}))).concat(Array.from({length:v.spares},(_,i)=>({id:`S${i+1}`,label:`Estepe ${i+1}`,axis:0,side:"S"})));
}
const fireKey=(v:string)=>v.trim().toUpperCase().replace(/^0+(?=\d)/,"");
export function emptyInventory(customer:Customer):Inventory{return {customer,vehicles:[],tires:[],movements:[]};}
export function applyCommand(input:Inventory,raw:unknown,now=new Date().toISOString()):Inventory{
 const c=commandSchema.parse(raw),s=structuredClone(input);
 if(c.type==="customer"){s.customer=c.customer;return s;}
 if(c.type==="vehicle"){
  if(s.vehicles.some(v=>v.id===c.vehicle.id||v.plate===c.vehicle.plate))throw Error("Veículo ou placa já cadastrados.");
  if(s.vehicles.length>=500)throw Error("Limite de veículos atingido.");
  s.vehicles.push(c.vehicle);return s;
 }
 if(c.type==="batch"){
  if(s.tires.length+c.tires.length>5000)throw Error("Limite de pneus atingido.");
  let next=[...s.tires,...c.tires].reduce((max,t)=>/^\d+$/.test(t.fire)&&BigInt(t.fire)>max?BigInt(t.fire):max,BigInt(0))+BigInt(1);
  const used=new Set(s.tires.map(t=>fireKey(t.fire)));
  for(const item of c.tires){
   const fire=item.fire||(next++).toString().padStart(4,"0");
   if(fire.length>30)throw Error("Sequência de fogo excedeu 30 caracteres.");
   if(used.has(fireKey(fire)))throw Error("Número de fogo já utilizado, inclusive em pneus baixados.");
   used.add(fireKey(fire));
   const tire:Tire={...item,...c.product,fire,id:crypto.randomUUID(),status:"estoque",vehicleId:null,position:null,createdDate:c.date};
   s.tires.push(tire);s.movements.push({id:crypto.randomUUID(),tireId:tire.id,date:c.date,recordedAt:now,from:"cadastro",to:"estoque",reason:"Cadastro de pneu",km:null,vehicleId:null,position:null});
  }
  return s;
 }
 const t=s.tires.find(t=>t.id===c.tireId);if(!t)throw Error("Pneu não pertence a este cliente.");
 if(c.type==="identity"){
  if(!c.identity.fire)throw Error("Informe o número de fogo.");
  if(s.tires.some(x=>x.id!==t.id&&fireKey(x.fire)===fireKey(c.identity.fire)))throw Error("Número de fogo já utilizado.");
  if(fireKey(c.identity.fire)!==fireKey(t.fire))throw Error("O número de fogo é permanente. Não pode ser substituído.");
  const before=`DOT ${t.dot||"não informado"}; série ${t.serial||"não informada"}; marcado ${t.marked}`;
  Object.assign(t,c.identity);
  s.movements.push({id:crypto.randomUUID(),tireId:t.id,date:now.slice(0,10),recordedAt:now,from:t.status,to:t.status,reason:`Identificação atualizada. Antes: ${before}. Depois: DOT ${t.dot}; série ${t.serial}; marcado ${t.marked}`,km:null,vehicleId:t.vehicleId,position:t.position});return s;
 }
 if(t.status==="baixado")throw Error("Pneu baixado não pode voltar à operação.");
 const latest=s.movements.filter(m=>m.tireId===t.id&&m.reason!=="").filter(m=>m.km!==null||m.from!==m.to).at(-1);
 if(c.date<t.createdDate||(latest&&c.date<latest.date))throw Error("A data não pode anteceder a última movimentação.");
 if(c.destination==="montado"){
  const v=s.vehicles.find(v=>v.id===c.vehicleId);
  if(!v||!positions(v).some(p=>p.id===c.position))throw Error("Veículo ou posição inválida.");
  if(s.tires.some(x=>x.id!==t.id&&x.status==="montado"&&x.vehicleId===v.id&&x.position===c.position))throw Error("Posição ocupada. Remova o pneu atual primeiro.");
 }else if(c.vehicleId!==null||c.position!==null)throw Error("Destino fora do veículo não aceita posição.");
 if(t.status===c.destination&&t.vehicleId===c.vehicleId&&t.position===c.position)throw Error("O pneu já está neste destino.");
 s.movements.push({id:crypto.randomUUID(),tireId:t.id,date:c.date,recordedAt:now,from:`${t.status}${t.vehicleId?": "+s.vehicles.find(v=>v.id===t.vehicleId)?.plate+" / "+t.position:""}`,to:c.destination,reason:c.reason,km:c.km,vehicleId:c.vehicleId,position:c.position});
 Object.assign(t,{status:c.destination,vehicleId:c.vehicleId,position:c.position});return s;
}

