"use client";
import {VehicleMap} from "./VehicleMap";
import {useState} from "react";
import {bodies,kinds,configurationCatalog,configurationSources,searchConfigurations,type Configuration,type VehicleKind} from "@/lib/frota/vehicleConfigurations";
import {positions,type Vehicle} from "@/lib/frota/tireInventory";
const field="block w-full rounded border border-border bg-background p-2 text-foreground";
export function VehicleConfigurationForm({busy,onSave}:{busy:boolean;onSave:(v:Vehicle)=>Promise<boolean>}){
 const [config,setConfig]=useState<Configuration>(()=>structuredClone(configurationCatalog["cavalo-4x2"]));
 const [preset,setPreset]=useState("cavalo-4x2"),[query,setQuery]=useState(""),[error,setError]=useState("");
 const choose=(id:string)=>{setPreset(id);setConfig(structuredClone(configurationCatalog[id]));};
 const options=searchConfigurations(query,config.kind);
 const preview:Vehicle={id:"preview",plate:"PRÉVIA",model:"",layout:"personalizado",configuration:config,spares:null};
 return <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setError("");const f=new FormData(e.currentTarget),str=(k:string)=>String(f.get(k)||"").trim();if(!!str("date")!==!!str("km")){setError("Preencha data e odômetro juntos, ou deixe ambos vazios.");return;}await onSave({id:crypto.randomUUID(),plate:str("plate"),model:str("model"),layout:"personalizado",configuration:config,spares:str("spares")===""?null:Number(str("spares")),...(str("date")?{mountingReference:{date:str("date"),km:Number(str("km"))}}:{})});}}>
 <fieldset disabled={busy} className="space-y-4">
 <div className="grid gap-3 md:grid-cols-2"><label>Placa própria / identificação do implemento<input className={field} name="plate" required minLength={7} maxLength={12}/></label><label>Marca e modelo<input className={field} name="model" required maxLength={160}/></label>
 <label>Tipo de veículo<select className={field} value={config.kind} onChange={e=>{const kind=e.target.value as VehicleKind;choose(Object.entries(configurationCatalog).find(([,c])=>c.kind===kind)![0]);setQuery("");}}>{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label>Buscar configuração<input className={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="4x2, quatro por dois, 3 eixos…"/></label>
 <label>Modelo de configuração<select className={field} value={preset} onChange={e=>choose(e.target.value)}>{!options.some(([id])=>id===preset)&&<option value={preset}>{configurationCatalog[preset].label}</option>}{options.map(([id,c])=><option key={id} value={id}>{c.label}</option>)}</select>{options.length===0&&<small>Nenhum resultado. Escolha outro termo ou ajuste os eixos abaixo.</small>}</label>
 <label>Carroceria / apresentação<select className={field} value={config.body} onChange={e=>setConfig({...config,body:e.target.value as Configuration["body"]})}>{Object.entries(bodies).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label>Nome da configuração salva<input className={field} required maxLength={160} value={config.label} onChange={e=>setConfig({...config,label:e.target.value})}/></label>
 <label>Estepes<select className={field} name="spares" defaultValue=""><option value="">Não informado</option>{[0,1,2,3,4,5,6].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Data de montagem informada<input className={field} type="date" name="date"/></label><label>Odômetro na montagem<input className={field} type="number" min="0" max="10000000" step="0.1" name="km"/></label></div>
 <p className="text-sm">{config.axes.length} eixos · {positions(preview).length} posições sem estepes. Confira a configuração física antes de salvar. Os modelos não são homologação nem definição de capacidade de carga.</p>
 {config.axes.map((a,i)=><div key={i} className="grid gap-2 rounded border border-border p-3 sm:grid-cols-3"><label>{i+1}º eixo · função<input className={field} required maxLength={160} value={a.role} onChange={e=>setConfig({...config,axes:config.axes.map((x,j)=>j===i?{...x,role:e.target.value}:x)})}/></label><label>Rodagem<select className={field} value={a.wheels} onChange={e=>setConfig({...config,axes:config.axes.map((x,j)=>j===i?{...x,wheels:Number(e.target.value) as 2|4}:x)})}><option value={2}>Simples · 2 pneus</option><option value={4}>Dupla · 4 pneus</option></select></label><label>Distância visual ao eixo anterior<select className={field} disabled={i===0} value={a.gap} onChange={e=>setConfig({...config,axes:config.axes.map((x,j)=>j===i?{...x,gap:Number(e.target.value)}:x)})}><option value={1}>Juntos</option><option value={2}>Separados</option><option value={3}>Distanciados</option><option value={4}>Muito distanciados</option></select></label></div>)}
 <div className="flex gap-3"><button type="button" disabled={config.axes.length>=10} onClick={()=>setConfig({...config,axes:[...config.axes,{role:"livre",wheels:4,gap:1}]})}>+ Adicionar eixo</button><button type="button" disabled={config.axes.length<=1} onClick={()=>setConfig({...config,axes:config.axes.slice(0,-1)})}>Remover último eixo</button></div>
 <p className="text-sm">Bitrem, rodotrem e Romeu e Julieta: cadastre cada unidade separadamente, com sua placa/identificação. O total de eixos do conjunto não é o total de um único implemento. Este cadastro não altera veículos já salvos.</p>
 <details open><summary>Prévia da configuração selecionada</summary><VehicleMap vehicle={preview} tires={[]}/></details>
 {error&&<p role="alert">{error}</p>}<button className="rounded border border-border bg-primary px-4 py-2 text-primary-foreground">Cadastrar veículo com esta configuração</button>
 </fieldset><details><summary>Referências do catálogo · consultadas em 08/11/2026</summary>{configurationSources.map(s=><p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></p>)}<p>Modelos ajustáveis. Configurações especiais devem seguir o veículo real; não representam todas as variantes de todos os fabricantes.</p></details>
 </form>;
}
