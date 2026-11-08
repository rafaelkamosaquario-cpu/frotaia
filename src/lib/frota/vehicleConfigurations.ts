/** Defaults are mapping templates, not homologation or load-capacity declarations. */
export type Axle = { role: string; wheels: 2 | 4; gap: number };
export type VehicleKind = "cavalo" | "caminhao" | "semirreboque" | "julieta" | "dolly";
export type BodyKind = "chassi" | "bau" | "tanque" | "basculante" | "florestal" | "plataforma";
export type Configuration = { label: string; kind: VehicleKind; body: BodyKind; axes: Axle[] };
const axle=(role:string,wheels:2|4=4,gap=1):Axle=>({role,wheels,gap});
export const kinds:Record<VehicleKind,string>={cavalo:"Cavalo mecânico",caminhao:"Caminhão rígido",semirreboque:"Semirreboque / carreta",julieta:"Reboque / Julieta",dolly:"Dolly"};
export const bodies:Record<BodyKind,string>={chassi:"Chassi / quinta roda",bau:"Baú / sider / frigorífico",tanque:"Tanque",basculante:"Basculante",florestal:"Florestal",plataforma:"Plataforma / graneleiro / porta-contêiner"};
const motor:Record<string,Axle[]>={
 "4x2":[axle("dianteiro direcional",2),axle("tração",4,2)],
 "4x4":[axle("direcional e tração",2),axle("tração",4,2)],
 "6x2":[axle("dianteiro direcional",2),axle("tração",4,2),axle("auxiliar")],
 "6x2-pusher":[axle("dianteiro direcional",2),axle("auxiliar antes da tração",4,2),axle("tração")],
 "6x4":[axle("dianteiro direcional",2),axle("tração",4,2),axle("tração")],
 "6x6":[axle("direcional e tração",2),axle("tração",4,2),axle("tração")],
 "8x2":[axle("direcional",2),axle("direcional",2),axle("tração",4,2),axle("auxiliar")],
 "8x4":[axle("direcional",2),axle("direcional",2),axle("tração",4,2),axle("tração")],
 "8x4-tridem":[axle("direcional",2),axle("auxiliar",4,2),axle("tração"),axle("tração")],
 "8x6":[axle("direcional e tração",2),axle("auxiliar",4,2),axle("tração"),axle("tração")],
 "10x4":[axle("direcional",2),axle("direcional",2),axle("auxiliar",4,2),axle("tração"),axle("tração")],
};
export const configurationCatalog:Record<string,Configuration>={};
for(const kind of ["cavalo","caminhao"] as const)for(const [formula,axes] of Object.entries(motor)){
 configurationCatalog[`${kind}-${formula}`]={label:`${kinds[kind]} · ${formula.replace("-pusher"," · auxiliar diante da tração").replace("-tridem"," · tridem")}`,kind,body:kind==="cavalo"?"chassi":"plataforma",axes};
}
for(const kind of ["semirreboque","julieta","dolly"] as const)for(const count of (kind==="dolly"?[1,2,3]:[1,2,3,4,5,6])){
 configurationCatalog[`${kind}-${count}`]={label:`${kinds[kind]} · ${count} eixo(s)`,kind,body:kind==="dolly"?"chassi":"plataforma",axes:Array.from({length:count},(_,i)=>axle(kind==="julieta"&&i===0?"dianteiro do reboque":"livre",4,kind==="julieta"&&i===1?3:1))};
}
for(const [id,label,gaps] of [["semi-11","Semirreboque · 1+1 distanciados",[1,3]],["semi-12","Semirreboque · 1+2",[1,3,1]],["semi-111","Semirreboque · Vanderleia · 1+1+1",[1,3,3]],["semi-13","Semirreboque · quarto eixo · 1+3",[1,2,1,1]]] as [string,string,number[]][]){
 configurationCatalog[id]={label,kind:"semirreboque",body:"plataforma",axes:gaps.map(gap=>axle("livre",4,gap))};
}
export const configurationSources=[
 {label:"Volvo Brasil — fichas técnicas VM",url:"https://www.volvotrucks.com.br/pt-br/trucks/models/volvo-vm/specifications/data-sheets.html"},
 {label:"Volvo — configurações de chassi FH",url:"https://www.volvotrucks.com.pt/pt-pt/trucks/models/volvo-fh/specifications.html"},
 {label:"Randon — semirreboques e combinações",url:"https://www.randon.com.br/pt/produtos/linha-pesada/furgao/furgao-carga-geral"},
 {label:"Randon — sistemas de eixos distanciados",url:"https://www.randon.com.br/storage/Cat%C3%A1logos/Manual%20Docs/8manual-canavieiropdf_4a61d913-a87b-480a-89cc-d0f4d8aa0fe0.pdf"},
];
export function searchConfigurations(query:string,kind:VehicleKind){
 const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/quatro/g,"4").replace(/seis/g,"6").replace(/oito/g,"8").replace(/dois/g,"2").replace(/dez/g,"10").replace(/por|×/g,"x").replace(/eixo\(s\)|eixos/g,"eixo").replace(/\s/g,"");
 const q=normalize(query);return Object.entries(configurationCatalog).filter(([,c])=>c.kind===kind&&normalize(c.label).includes(q));
}
