import {useId} from "react";
import type {Configuration} from "@/lib/frota/vehicleConfigurations";
/** Parametric diagram: no embedded tires or axles from another configuration. */
export function ConfiguredVehicle({config,height,axisY}:{config:Configuration;height:number;axisY:number[]}){
 const gradient=useId();const motor=config.kind==="cavalo"||config.kind==="caminhao";
 const wheels=config.axes.map(a=>a.wheels).join(',');
 const approved=config.kind==='cavalo'&&config.body==='chassi'&&wheels==='2,4'?'/images/tire-cases/truck-4x2.webp':config.kind==='cavalo'&&config.body==='chassi'&&wheels==='2,4,4'?'/images/tire-cases/truck.png':config.kind==='semirreboque'&&config.body==='tanque'&&wheels==='4,4,4,4'?'/images/tire-cases/tanker-mapping.png':null;
 // Preserve approved illustrations for matching standard geometries.
 if(approved&&config.axes.every((a,i)=>a.gap===(i===1?2:1)))return <img alt={config.label} src={approved} className="absolute inset-y-0 left-[32%] h-full w-[36%] object-contain"/>;
 return <svg role="img" aria-label={`${config.label}, ${config.axes.length} eixos, ${config.axes.reduce((n,a)=>n+a.wheels,0)} pneus`} viewBox={`0 0 160 ${height}`} preserveAspectRatio="none" className="absolute inset-y-0 left-[32%] h-full w-[36%]">
 <defs><linearGradient id={gradient}><stop stopColor="#64748b"/><stop offset=".3" stopColor="#e2e8f0"/><stop offset=".6" stopColor="#f8fafc"/><stop offset="1" stopColor="#64748b"/></linearGradient></defs>
 <rect x="47" y="14" width="66" height={height-26} rx="7" fill="#1e293b"/>
 {!motor&&<path d="M80 0L55 30H105Z" fill="#475569"/>}
 {config.body!=="chassi"&&<><rect x="32" y={motor?72:24} width="96" height={height-(motor?92:44)} rx={config.body==="tanque"?40:5} fill={`url(#${gradient})`} stroke="#475569" strokeWidth="3"/>{config.body==="tanque"?axisY.map((y,i)=><circle key={i} cx="80" cy={Math.max(y-30,50)} r="10" fill="#94a3b8" stroke="#334155"/>):Array.from({length:Math.floor(height/40)},(_,i)=><path key={i} d={`M36 ${40+i*40}H124`} stroke={config.body==="florestal"?"#854d0e":"#94a3b8"} strokeWidth={config.body==="florestal"?12:2}/>)}</>}
 {motor&&<><rect x="24" y="4" width="112" height="68" rx="14" fill={`url(#${gradient})`} stroke="#475569" strokeWidth="3"/><rect x="34" y="12" width="92" height="17" rx="5" fill="#12334c"/><rect x="52" y="38" width="56" height="20" rx="5" fill="#94a3b8"/><path d="M18 30V48M142 30V48" stroke="#334155" strokeWidth="7"/></>}
 {config.body==="chassi"&&<ellipse cx="80" cy={height*.67} rx="26" ry="22" fill="#64748b" stroke="#cbd5e1" strokeWidth="3"/>}
 {config.axes.map((a,i)=><g key={i}><path d={`M15 ${axisY[i]}H145`} stroke="#475569" strokeWidth="7"/>{(a.wheels===2?[12,134]:[5,22,122,139]).map(x=><g key={x}><rect x={x} y={axisY[i]-18} width="14" height="36" rx="5" fill="#17212e" stroke="#020617"/><path d={`M${x+4} ${axisY[i]-13}V${axisY[i]+13}M${x+9} ${axisY[i]-13}V${axisY[i]+13}`} stroke="#64748b" strokeWidth="1"/></g>)}</g>)}
 </svg>;
}
