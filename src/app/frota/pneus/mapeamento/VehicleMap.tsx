"use client";
import {positions,configurationOf,type Vehicle,type Tire} from "@/lib/frota/tireInventory";
import {ConfiguredVehicle} from "./ConfiguredVehicle";
export function VehicleMap({vehicle,tires,onPosition,onOccupied}:{vehicle:Vehicle;tires:Tire[];onPosition?:(position:string,tireId?:string)=>void;onOccupied?:(t:Tire)=>void}){
 const all=positions(vehicle),config=configurationOf(vehicle),axes=config.axes.length;
 const gaps=config.axes.map((a,i)=>i===0?0:(a.gap-1)*24);const axisY=config.axes.map((_,i)=>56+i*112+gaps.slice(0,i+1).reduce((a,b)=>a+b,0)+50);const diagramHeight=axes*112+56+gaps.reduce((a,b)=>a+b,0);
 return <div className="mx-auto max-w-2xl rounded-xl border border-slate-300 bg-slate-50 p-3 text-slate-900">
 <p className="text-center text-xs font-semibold">FRENTE ↑ · {vehicle.plate}</p>
 <div className="relative mt-3 pt-14">
 <ConfiguredVehicle config={config} height={diagramHeight} axisY={axisY}/>
 {Array.from({length:axes},(_,i)=><div key={i} className="relative" style={{height:112,marginTop:gaps[i]}}><p className="relative z-10 mx-auto w-fit rounded bg-white/90 px-2 text-xs">{`${i+1}º · ${config.axes[i].role}`}</p><div className="grid grid-cols-6 gap-1 sm:gap-2">{all.filter(p=>p.axis===i+1).map((p,j)=>{const t=tires.find(t=>t.vehicleId===vehicle.id&&t.position===p.id&&t.status==="montado");return <button type="button" disabled={!onPosition} key={p.id} aria-label={p.label+(t?" · fogo "+t.fire:" · sem identificação")} onDragOver={e=>{if(!t)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!t)onPosition?.(p.id,e.dataTransfer.getData("text/plain"));}} onClick={()=>t?onOccupied?.(t):onPosition?.(p.id)} className={`relative z-10 min-h-20 rounded-[40%] border-4 border-slate-700 p-1 text-xs ${t?"bg-amber-200":"bg-white"} ${all.filter(x=>x.axis===i+1).length===2?(j===1?"col-start-6":""):j===2?"col-start-5":""}`}><span className="block font-bold">{p.id}</span><span className="block">{t?"Fogo "+t.fire:"Não cadastrado"}</span>{t&&<span>{t.brand}<br/>{t.model}</span>}</button>;})}</div></div>)}
 </div>
 <div className="mt-4 flex justify-center gap-3">{all.filter(p=>p.axis===0).map(p=>{const t=tires.find(t=>t.vehicleId===vehicle.id&&t.position===p.id&&t.status==="montado");return <button key={p.id} disabled={!onPosition} onClick={()=>t?onOccupied?.(t):onPosition?.(p.id)} className={`rounded-full border-4 border-slate-700 p-3 text-xs ${t?"bg-amber-200":"bg-white"}`}>{p.label}<br/>{t?"Fogo "+t.fire:"Não cadastrado"}</button>;})}</div>
 <p className="mt-3 text-center text-xs">{config.label} · {vehicle.spares===null?"Estepes não informados":`${vehicle.spares} estepe(s)`}</p>{vehicle.mountingReference&&<p className="mt-3 rounded bg-blue-100 p-3 text-sm"><strong>Montagem informada:</strong> {vehicle.mountingReference.date.split("-").reverse().join("/")} · {vehicle.mountingReference.km.toLocaleString("pt-BR")} km. Identificação e aplicação de cada pneu registradas separadamente.</p>}<p className="mt-3 text-center text-xs">TRASEIRA · desenho esquemático · lados considerados no sentido de marcha</p></div>;
}

