"use client";
import {positions,configurationOf,type Vehicle,type Tire} from "@/lib/frota/tireInventory";
import {ConfiguredVehicle} from "./ConfiguredVehicle";
export function VehicleMap({vehicle,tires,onPosition,onOccupied}:{vehicle:Vehicle;tires:Tire[];onPosition?:(position:string,tireId?:string)=>void;onOccupied?:(t:Tire)=>void}){
 const all=positions(vehicle),config=configurationOf(vehicle);
 const rowHeights=config.axes.map(a=>a.wheels===4?300:160);
 const gaps=config.axes.map((a,i)=>i===0?0:(a.gap-1)*16);
 const axisY=config.axes.map((_,i)=>rowHeights.slice(0,i).reduce((a,b)=>a+b,0)+gaps.slice(0,i+1).reduce((a,b)=>a+b,0)+rowHeights[i]/2);
 const diagramHeight=rowHeights.reduce((a,b)=>a+b,0)+gaps.reduce((a,b)=>a+b,0);
 const card=(p:ReturnType<typeof positions>[number])=>{
  const t=tires.find(t=>t.vehicleId===vehicle.id&&t.position===p.id&&t.status==="montado");
  const interactive=!!onPosition||!!(t&&onOccupied);
  return <button type="button" key={p.id} disabled={!interactive} aria-label={p.label+(t?" · fogo "+t.fire:" · sem identificação")} onDragOver={e=>{if(!t&&onPosition)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!t)onPosition?.(p.id,e.dataTransfer.getData("text/plain"));}} onClick={()=>t?onOccupied?.(t):onPosition?.(p.id)} className="relative z-10 w-full rounded-xl border border-[#cfdfeb] bg-[#f0f6fa] p-3 text-left text-xs leading-5 text-[#153047] [overflow-wrap:anywhere] disabled:opacity-100 print:break-inside-avoid">
   <span className="mb-2 flex items-start gap-2 font-bold uppercase"><span className={`shrink-0 rounded-full border px-2 py-0.5 ${t?"border-amber-600 bg-amber-300":p.axis===0?"border-cyan-500 bg-cyan-200":"border-slate-300 bg-white"}`}>{p.id}</span><span>{p.label}</span></span>
   <span className="block"><strong>DOT:</strong> {t?.dot||"A informar"}</span>
   <span className="block"><strong>Nº de fogo:</strong> {t?.fire||"—"}</span>
   <span className="block"><strong>Série:</strong> {t?.serial||"A informar"}</span>
   <span className="block"><strong>Modelo:</strong> {t?`${t.brand} ${t.model} · ${t.life} · ${t.size}`:"Pneu não vinculado"}</span>
   <span className="block font-semibold text-[#0087b5]">Banda: {t?.tread||"A informar"}</span>
  </button>;
 };
 return <div className="mx-auto max-w-5xl overflow-x-auto rounded-xl border border-slate-300 bg-white text-[#153047] print:overflow-visible">
 <div className="min-w-[620px] print:min-w-0">
 <header className="flex justify-between gap-4 bg-[#132e42] px-5 py-4 text-white"><div><strong className="text-xl">RODOCORE</strong><p className="text-xs">CONSULTORIA | MAPEAMENTO DE PNEUS</p></div><div><strong className="text-xl text-[#53c8e8]">FROTA IA</strong><p className="text-xs">PAINEL WEB</p></div></header>
 <div className="p-4"><h3 className="font-bold">{vehicle.plate} · {vehicle.model||config.label}</h3><p className="text-xs">{config.label} · {config.axes.length} eixos</p><p className="my-4 text-center text-xs font-bold text-[#0087b5]">FRENTE DO VEÍCULO ↑</p>
 <div className="relative" style={{minHeight:diagramHeight}}>
 <ConfiguredVehicle config={config} height={diagramHeight} axisY={axisY}/>
 {config.axes.map((a,i)=>{const ps=all.filter(p=>p.axis===i+1),half=ps.length/2;return <div key={i} className="relative grid grid-cols-[1fr_0.75fr_1fr] items-start gap-3" style={{minHeight:rowHeights[i],marginTop:gaps[i]}}>
 <div className="space-y-3">{ps.slice(0,half).map(card)}</div>
 <div className="pointer-events-none relative z-10 pt-2 text-center"><span className="rounded bg-white/90 px-1 text-[10px]">{i+1}º eixo · {a.role}</span></div>
 <div className="space-y-3">{ps.slice(half).reverse().map(card)}</div>
 </div>;})}
 </div>
 {all.some(p=>p.axis===0)&&<div className="mt-4 grid grid-cols-2 gap-3">{all.filter(p=>p.axis===0).map(card)}</div>}
 <p className="my-3 text-center text-xs">TRASEIRA DO VEÍCULO · {vehicle.spares===null?"Estepes não informados":`${vehicle.spares} estepe(s)`}</p>
 <footer className="border-t border-slate-200 pt-3 text-xs text-slate-600"><p>Amarelo: pneu vinculado. Identificadores E1-P1, E2-P1… indicam posições; não substituem o número de fogo. Esquerda e direita no sentido de marcha. Ilustração genérica.</p>
 {vehicle.mountingReference&&<p className="mt-2"><strong>Montagem informada:</strong> {vehicle.mountingReference.date.split("-").reverse().join("/")} · {vehicle.mountingReference.km.toLocaleString("pt-BR")} km. Aplicação individual registrada separadamente.</p>}
 </footer></div></div></div>;
}

