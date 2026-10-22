"use client";
import {useEffect,useState,type FormEvent} from "react";
import {positions,type InventoryRow,type Customer,type Command,type Tire,type Vehicle} from "@/lib/frota/tireInventory";

const box="rounded-xl border border-border bg-surface p-4 space-y-3";
const field="w-full rounded-lg border border-border bg-background p-2 text-foreground";
const button="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40";
const today=()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
function Input({name,label,type="text",required=false,defaultValue=""}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string}){
 return <label className="block text-sm">{label}<input className={field} name={name} type={type} required={required} defaultValue={defaultValue}/></label>;
}
export function TireInventoryClient(){
 const [rows,setRows]=useState<InventoryRow[]>([]),[customers,setCustomers]=useState<{id:string;customer:Customer}[]>([]);
 const [selected,setSelected]=useState(""),[vehicleId,setVehicleId]=useState(""),[tireId,setTireId]=useState("");
 const [tab,setTab]=useState("mapa"),[busy,setBusy]=useState(false),[message,setMessage]=useState("Carregando…");
 const [quantity,setQuantity]=useState(1),[filter,setFilter]=useState("todos"),[search,setSearch]=useState("");
 const [report,setReport]=useState("");
 const [sourceClient,setSourceClient]=useState("");
 const [move,setMove]=useState<{tire:Tire;vehicleId:string|null;position:string|null;destination:"estoque"|"montado"|"servico"|"baixado"}|null>(null);
 const row=rows.find(r=>r.id===selected),state=row?.data,vehicle=state?.vehicles.find(v=>v.id===vehicleId);
 async function reload(){
  try{const res=await fetch("/api/frota/pneus/mapeamento",{cache:"no-store"});const b=await res.json();if(!res.ok)throw Error(b.error);setRows(b.rows);setCustomers(b.customers);setMessage("");}
  catch(e){setMessage(e instanceof Error?e.message:"Falha ao carregar.");}
 }
 useEffect(()=>{let active=true;fetch("/api/frota/pneus/mapeamento",{cache:"no-store"}).then(async res=>{const b=await res.json();if(!res.ok)throw Error(b.error);if(active){setRows(b.rows);setCustomers(b.customers);const requested=new URLSearchParams(window.location.search).get("cliente")||"";const existing=(b.rows as InventoryRow[]).find(r=>r.source_case_id===requested);if(existing)setSelected(existing.id);else if((b.customers as {id:string}[]).some(c=>c.id===requested))setSourceClient(requested);setMessage("");}}).catch(e=>{if(active)setMessage(String(e.message));});return()=>{active=false;};},[]);
 async function save(command:Command,create?:{sourceCaseId:string|null}){
  if(busy)return false;setBusy(true);setMessage("Salvando…");
  try{
   const res=await fetch("/api/frota/pneus/mapeamento",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:create?crypto.randomUUID():row?.id,version:create?0:row?.version,sourceCaseId:create?.sourceCaseId,command})});
   const b=await res.json();if(!res.ok)throw Error(b.error);
   setRows(prev=>[b.row,...prev.filter(r=>r.id!==b.row.id)]);setSelected(b.row.id);setMessage("Salvo. Histórico preservado.");return true;
  }catch(e){setMessage(e instanceof Error?e.message:"Falha ao salvar.");return false;}finally{setBusy(false);}
 }
 const form=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();return new FormData(e.currentTarget);};
 const str=(f:FormData,k:string)=>String(f.get(k)||"").trim();
 function choosePosition(v:Vehicle,p:string,id=tireId){
  const tire=state?.tires.find(t=>t.id===id);if(!tire){setMessage("Selecione um pneu disponível antes de escolher a posição.");return;}
  setMove({tire,vehicleId:v.id,position:p,destination:"montado"});
 }
 const counts=state?Object.fromEntries(["estoque","montado","servico","baixado"].map(s=>[s,state.tires.filter(t=>t.status===s).length])):{};
 const visible=state?.tires.filter(t=>(filter==="todos"||t.status===filter)&&[t.fire,t.brand,t.model,t.serial,t.dot].join(" ").toLowerCase().includes(search.toLowerCase()))??[];
 return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
 <div className="print:hidden space-y-4">
 <a href="/frota/pneus/acompanhamento" className="text-primary">← Acompanhamento e projeções / cadastro de clientes</a>
 <header><p className="text-sm text-primary">EXCLUSIVO ADM · RODOCORE / FROTA IA PAINEL WEB</p><h1 className="text-2xl font-bold">Mapeamento e inventário de pneus</h1><p className="text-muted-foreground">Identidade, posição e histórico. Independente das projeções de quilometragem.</p></header>
 <div role="status" aria-live="polite" className="rounded-lg border border-border p-3">{message||"Selecione um cliente para trabalhar."} <button className={button} onClick={reload} disabled={busy}>Recarregar</button></div>
 <label className="block">Empresa do cliente<select className={field} value={selected} onChange={e=>{setSelected(e.target.value);setVehicleId("");setTireId("");setReport("");}}><option value="">Selecionar…</option>{rows.map(r=><option key={r.id} value={r.id}>{r.data.customer.name} · {r.data.tires.length} pneus</option>)}</select></label>
 <details className={box} open={sourceClient!==""||undefined}><summary className="cursor-pointer font-semibold">Adicionar cliente ao mapeamento</summary>
 <p className="text-sm">Use o cadastro do acompanhamento, sem recriar a empresa e sem importar pneus automaticamente.</p>
 {customers.filter(c=>!rows.some(r=>r.source_case_id===c.id)).sort((a,b)=>Number(b.id===sourceClient)-Number(a.id===sourceClient)).map(c=><button key={c.id} disabled={busy} className={button+(c.id===sourceClient?" border-primary font-semibold":"")} onClick={async()=>{if(await save({type:"customer",customer:c.customer},{sourceCaseId:c.id}))setSourceClient("");}}>Usar {c.customer.name}{c.id===sourceClient?" · cliente selecionado no acompanhamento":""}</button>)}
 <details><summary>Novo cliente somente de mapeamento</summary><form className="grid gap-3 md:grid-cols-2" onSubmit={async e=>{const f=form(e);await save({type:"customer",customer:{name:str(f,"name"),document:str(f,"document"),address:str(f,"address"),phone:str(f,"phone")}},{sourceCaseId:null});}}>
 <Input name="name" label="Razão social / nome" required/><Input name="document" label="CNPJ / documento"/><Input name="address" label="Endereço"/><Input name="phone" label="Telefone"/><button disabled={busy} className={button}>Cadastrar cliente</button></form></details></details>
 {state&&row&&<>
 <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[["Total",state.tires.length],["Montados",counts.montado],["Estoque",counts.estoque],["Em serviço",counts.servico],["Baixados",counts.baixado]].map(([label,count])=><div className={box} key={label}><div className="text-sm">{label}</div><strong className="text-2xl">{count}</strong></div>)}</div>
 <nav className="flex flex-wrap gap-2" aria-label="Mapeamento">{[["mapa","Mapa por veículo"],["pneus","Cadastro e estoque"],["veiculos","Veículos / implementos"],["historico","Histórico"],["relatorios","Relatórios"]].map(([id,label])=><button className={button+(tab===id?" bg-primary text-primary-foreground":"")} key={id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 {tab==="veiculos"&&<section className={box}><h2 className="font-semibold">Cadastrar veículo ou implemento</h2><form className="grid gap-3 md:grid-cols-2" onSubmit={async e=>{const f=form(e);await save({type:"vehicle",vehicle:{id:crypto.randomUUID(),plate:str(f,"plate"),model:str(f,"model"),layout:str(f,"layout") as Vehicle["layout"],spares:Number(str(f,"spares"))}});}}>
 <Input name="plate" label="Placa própria do veículo / implemento" required/><Input name="model" label="Marca e modelo" required/>
 <label>Configuração<select name="layout" className={field}><option value="cavalo6x2">Cavalo 6x2 · dianteiro, tração e auxiliar</option><option value="tanque4">Carreta tanque · quatro eixos duplos</option></select></label>
 <label>Estepes<select className={field} name="spares"><option>0</option><option>1</option><option>2</option></select></label>
 <p className="text-sm md:col-span-2">Confirme a configuração real. A carreta tem cadastro e placa separados do cavalo. O desenho é ilustrativo; não determina a função real de um eixo.</p><button className={button} disabled={busy}>Cadastrar veículo</button></form>
 {state.vehicles.map(v=><p key={v.id}>{v.plate} · {v.model} · {positions(v).length} posições</p>)}</section>}
 {tab==="pneus"&&<>
 <details className={box}><summary className="font-semibold">Cadastrar lote de pneus</summary><form className="space-y-3" onSubmit={async e=>{const f=form(e);await save({type:"batch",date:str(f,"date"),product:{brand:str(f,"brand"),model:str(f,"model"),size:str(f,"size"),tread:str(f,"tread"),life:str(f,"life") as Tire["life"]},tires:Array.from({length:quantity},(_,i)=>({fire:str(f,"fire"+i),dot:str(f,"dot"+i),serial:str(f,"serial"+i),marked:f.get("marked"+i)==="on"}))});}}>
 <div className="grid gap-3 md:grid-cols-3"><Input name="brand" label="Marca" required/><Input name="model" label="Modelo" required/><Input name="size" label="Medida" required/><Input name="tread" label="Desenho / banda aplicada"/><Input name="date" label="Data do cadastro / entrada" type="date" required defaultValue={today()}/><label>Vida<select name="life" className={field}>{["Novo","1ª recapagem","2ª recapagem","Outra"].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Quantidade<input className={field} type="number" min={1} max={100} value={quantity} onChange={e=>setQuantity(Math.max(1,Math.min(100,Number(e.target.value)||1)))}/></label></div>
 <p className="text-sm">Fogo em branco: gerar sequência automaticamente. DOT e série podem ficar pendentes. “Marcado” confirma a gravação física, não apenas o cadastro.</p>
 {Array.from({length:quantity},(_,i)=><div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-4" key={i}><Input name={"fire"+i} label={`Pneu ${i+1} · fogo (opcional)`}/><Input name={"dot"+i} label="DOT"/><Input name={"serial"+i} label="Série"/><label className="self-end"><input type="checkbox" name={"marked"+i}/> Fogo já marcado no pneu</label></div>)}
 <button className={button} disabled={busy}>Cadastrar lote no estoque</button></form></details>
 <div className="flex gap-3"><input className={field} placeholder="Buscar fogo, marca, DOT ou série" aria-label="Buscar pneu" value={search} onChange={e=>setSearch(e.target.value)}/><select className={field} aria-label="Situação" value={filter} onChange={e=>setFilter(e.target.value)}>{["todos","estoque","montado","servico","baixado"].map(x=><option key={x}>{x}</option>)}</select></div>
 {visible.map(t=><article className={box} key={t.id}><h3 className="font-semibold">Fogo {t.fire} · {t.brand} {t.model} · {t.status}</h3><p>{t.size} · {t.tread||"Banda não informada"} · {t.life} · DOT {t.dot||"pendente"} · Série {t.serial||"pendente"}</p><p>{t.marked?"Fogo marcado":"Marcação física pendente"} {t.vehicleId&&` · ${state.vehicles.find(v=>v.id===t.vehicleId)?.plate} / ${t.position}`}</p>
 <details><summary>Completar DOT, série e marcação</summary><form className="grid gap-2 md:grid-cols-4" onSubmit={async e=>{const f=form(e);await save({type:"identity",tireId:t.id,identity:{fire:t.fire,dot:str(f,"dot"),serial:str(f,"serial"),marked:f.get("marked")==="on"}});}}><Input name="dot" label="DOT" defaultValue={t.dot}/><Input name="serial" label="Série" defaultValue={t.serial}/><label><input type="checkbox" name="marked" defaultChecked={t.marked}/> Fogo marcado</label><button className={button} disabled={busy}>Salvar identificação</button></form></details>
 {t.status!=="baixado"&&<div className="flex flex-wrap gap-2"><button className={button} onClick={()=>{setTireId(t.id);setTab("mapa");}}>Escolher posição</button>{(["estoque","servico","baixado"] as const).filter(d=>d!==t.status).map(d=><button className={button} key={d} onClick={()=>setMove({tire:t,destination:d,vehicleId:null,position:null})}>{d==="baixado"?"Dar baixa":d==="servico"?"Enviar para serviço":"Voltar ao estoque"}</button>)}</div>}</article>)}
 {!visible.length&&<p>Nenhum pneu neste filtro. Cadastre o primeiro lote.</p>}</>}
 {tab==="mapa"&&<section className={box}><h2 className="font-semibold">Posições do veículo</h2><label>Veículo<select className={field} value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Selecionar veículo…</option>{state.vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}</select></label>
 <label>Pneu disponível para montar<select className={field} value={tireId} onChange={e=>setTireId(e.target.value)}><option value="">Selecione o pneu…</option>{state.tires.filter(t=>t.status==="estoque").map(t=><option key={t.id} value={t.id}>Fogo {t.fire} · {t.brand} {t.model}</option>)}</select></label>
 <p className="text-sm">Selecione o pneu e clique na posição vazia. No computador, também pode arrastar do estoque. Amarelo = ocupado; contorno = vazio. A cor não indica desempenho.</p>
 <div className="flex flex-wrap gap-2">{state.tires.filter(t=>t.status==="estoque").map(t=><button key={t.id} className={button} draggable onDragStart={e=>e.dataTransfer.setData("text/plain",t.id)} onClick={()=>setTireId(t.id)}>◉ {t.fire}</button>)}</div>
 {vehicle?<VehicleMap vehicle={vehicle} tires={state.tires} onPosition={(p,id)=>choosePosition(vehicle,p,id)} onOccupied={t=>{setTireId(t.id);setTab("pneus");setSearch(t.fire);setFilter("todos");}}/>:<p>Cadastre ou selecione um veículo para ver o mapa.</p>}</section>}
 {tab==="historico"&&<section className={box}><h2 className="font-semibold">Histórico permanente</h2>{[...state.movements].reverse().map(m=><article key={m.id} className="border-b border-border py-2 text-sm"><strong>{m.date} · Fogo {state.tires.find(t=>t.id===m.tireId)?.fire}</strong><p>{m.from} → {m.to}{m.vehicleId&&` · ${state.vehicles.find(v=>v.id===m.vehicleId)?.plate} / ${m.position}`}</p><p>{m.reason}{m.km!==null&&` · Odômetro informado: ${m.km.toLocaleString("pt-BR")} km`}</p></article>)}</section>}
 {tab==="relatorios"&&<section className={box}><h2 className="font-semibold">Relatórios para entregar ao cliente</h2><p>Gere a visualização e use “Imprimir / salvar PDF”. O envio pelo WhatsApp é manual; nenhum documento é enviado automaticamente.</p><label>Veículo do mapa<select className={field} value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Selecionar…</option>{state.vehicles.map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></label><div className="flex flex-wrap gap-2">{[["mapa","Mapa por veículo"],["estoque","Pneus em estoque"],["baixado","Pneus baixados"],["resumo","Resumo da empresa"]].map(([id,label])=><button className={button} disabled={id==="mapa"&&!vehicle} key={id} onClick={()=>setReport(id)}>{label}</button>)}</div></section>}
 </>}
 {move&&<div role="dialog" aria-modal="true" aria-label="Confirmar movimentação" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"><form className={box+" w-full max-w-lg"} onSubmit={async e=>{const f=form(e);if(await save({type:"move",tireId:move.tire.id,date:str(f,"date"),km:str(f,"km")?Number(str(f,"km")):null,reason:str(f,"reason"),destination:move.destination,vehicleId:move.vehicleId,position:move.position}))setMove(null);}}>
 <h2 className="font-semibold">Fogo {move.tire.fire} → {move.destination}</h2><p>{move.position?state?.vehicles.find(v=>v.id===move.vehicleId)?.plate+" / "+move.position:""} {move.destination==="baixado"&&"Baixa definitiva. O cadastro e o histórico serão preservados."}</p><Input name="date" label="Data" type="date" required defaultValue={today()}/><Input name="reason" label="Motivo / observação" required/><Input name="km" label="Odômetro do veículo (opcional)" type="number"/><div className="flex gap-3"><button className={button} disabled={busy}>Confirmar movimentação</button><button className={button} type="button" disabled={busy} onClick={()=>setMove(null)}>Cancelar</button></div></form></div>}
 </div>
 {report&&state&&<section id="tire-mapping-report" className="rounded-xl border border-border bg-white p-6 text-black">
 <div className="print:hidden flex gap-3 mb-4"><button className={button} onClick={()=>window.print()}>Imprimir / salvar PDF</button><button className={button} onClick={()=>setReport("")}>Fechar relatório</button></div>
 <p className="text-sm">RODOCORE CONSULTORIA · Frota IA Painel Web</p><h2 className="text-2xl font-bold">{report==="mapa"?"Mapeamento de pneus":report==="estoque"?"Pneus em estoque":report==="baixado"?"Relatório de baixas":"Inventário de pneus"}</h2>
 <h3 className="text-xl">{state.customer.name}</h3><p>{state.customer.document} · {state.customer.phone}</p><p>{state.customer.address}</p><p className="text-sm">Emitido em {new Date().toLocaleString("pt-BR")} · revisão {row?.version} · situação atual dos registros</p>
 {report==="mapa"&&vehicle&&<><h3 className="my-4 font-bold">{vehicle.plate} · {vehicle.model}</h3><VehicleMap vehicle={vehicle} tires={state.tires}/></>}
 {report==="resumo"&&<p className="my-4">{state.vehicles.length} veículos / implementos · {state.tires.length} pneus · {counts.montado} montados (inclui estepes) · {counts.estoque} estoque · {counts.servico} em serviço · {counts.baixado} baixados</p>}
 <div className="overflow-x-auto"><table className="my-4 w-full text-left text-xs"><thead><tr>{["Fogo","Marca / modelo / medida","Banda / vida","DOT / série","Situação / posição"].map(h=><th className="border p-2" key={h}>{h}</th>)}</tr></thead><tbody>{state.tires.filter(t=>report==="mapa"?t.vehicleId===vehicleId:report==="resumo"?true:t.status===report).map(t=><tr key={t.id}><td className="border p-2">{t.fire}{!t.marked&&" (marcação pendente)"}</td><td className="border p-2">{t.brand} {t.model} {t.size}</td><td className="border p-2">{t.tread||"—"} / {t.life}</td><td className="border p-2">{t.dot||"Não informado"} / {t.serial||"Não informada"}</td><td className="border p-2">{t.status} {state.vehicles.find(v=>v.id===t.vehicleId)?.plate} {t.position}{t.status==="baixado"&&<p>{state.movements.filter(m=>m.tireId===t.id&&m.to==="baixado").map(m=>m.date+" · "+m.reason).join("; ")}</p>}</td></tr>)}</tbody></table></div>
 <p className="text-xs">Mapeamento de identificação e localização. Não representa laudo de segurança, medição de desgaste ou projeção de quilometragem. Posições vazias significam “sem pneu cadastrado”, não ausência física confirmada.</p></section>}
 <style>{`@media print {body * {visibility:hidden} #tire-mapping-report {-webkit-print-color-adjust:exact;print-color-adjust:exact} #tire-mapping-report td {overflow-wrap:anywhere} #tire-mapping-report thead {display:table-header-group} #tire-mapping-report,#tire-mapping-report * {visibility:visible} #tire-mapping-report {position:absolute;left:0;top:0;width:100%;border:0} #tire-mapping-report .print\\:hidden {display:none} tr {break-inside:avoid} @page {size:A4 portrait;margin:10mm}}`}</style>
 </main>;
}
function VehicleMap({vehicle,tires,onPosition,onOccupied}:{vehicle:Vehicle;tires:Tire[];onPosition?:(position:string,tireId?:string)=>void;onOccupied?:(t:Tire)=>void}){
 const all=positions(vehicle),axes=vehicle.layout==="cavalo6x2"?3:4;
 return <div className="mx-auto max-w-2xl rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-900">
 <p className="text-center text-xs font-semibold">FRENTE ↑ · {vehicle.plate}</p>
 <div className="relative mt-3 space-y-4 pt-14">
 {/* Generic approved illustration; all customer information remains behind the private route. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img alt="" aria-hidden="true" src={vehicle.layout==="tanque4"?"/images/tire-cases/tanker-mapping.png":"/images/tire-cases/truck.png"} className="absolute inset-y-0 left-[32%] h-full w-[36%] object-contain"/>
 {Array.from({length:axes},(_,i)=><div key={i} className="relative"><p className="relative z-10 mx-auto w-fit rounded bg-white/90 px-2 text-xs">{vehicle.layout==="cavalo6x2"?["1º · dianteiro","2º · tração","3º · auxiliar"][i]:`${i+1}º eixo`}</p><div className="grid grid-cols-6 gap-1 sm:gap-2">{all.filter(p=>p.axis===i+1).map((p,j)=>{const t=tires.find(t=>t.vehicleId===vehicle.id&&t.position===p.id&&t.status==="montado");return <button type="button" disabled={!onPosition} key={p.id} aria-label={p.label+(t?" · fogo "+t.fire:" · vazio")} onDragOver={e=>{if(!t)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!t)onPosition?.(p.id,e.dataTransfer.getData("text/plain"));}} onClick={()=>t?onOccupied?.(t):onPosition?.(p.id)} className={`relative z-10 min-h-20 rounded-[40%] border-4 border-slate-700 p-1 text-xs ${t?"bg-amber-200":"bg-white"} ${all.filter(x=>x.axis===i+1).length===2?(j===1?"col-start-6":""):j===2?"col-start-5":""}`}><span className="block font-bold">{p.id}</span><span className="block">{t?"Fogo "+t.fire:"Vazio"}</span>{t&&<span>{t.brand}<br/>{t.model}</span>}</button>;})}</div></div>)}
 </div>
 <div className="mt-4 flex justify-center gap-3">{all.filter(p=>p.axis===0).map(p=>{const t=tires.find(t=>t.vehicleId===vehicle.id&&t.position===p.id&&t.status==="montado");return <button key={p.id} disabled={!onPosition} onClick={()=>t?onOccupied?.(t):onPosition?.(p.id)} className={`rounded-full border-4 border-slate-700 p-3 text-xs ${t?"bg-amber-200":"bg-white"}`}>{p.label}<br/>{t?"Fogo "+t.fire:"Vazio"}</button>;})}</div>
 <p className="mt-3 text-center text-xs">TRASEIRA · desenho esquemático · lados considerados no sentido de marcha</p></div>;
}

