"use client";
import {ConfiguredVehicle} from "@/app/frota/pneus/mapeamento/ConfiguredVehicle";
import type {Configuration} from "@/lib/frota/vehicleConfigurations";
import {TireSheetTimeline} from "./TireSheetTimeline";
import {tireSheetTimeline} from "@/lib/frota/tireSheetTimeline";
import {TireSheetBrand,TireSheetIdentity} from "./TireSheetHeader";
import {useEffect,useRef,useState} from "react";
import {treadProjection,type TireCaseRow} from "@/lib/frota/tireCases";
import styles from "./preview.module.css";
const number=(v:number|null|undefined,d=0)=>v==null?"—":v.toLocaleString("pt-BR",{maximumFractionDigits:d});
const date=(v:string|undefined)=>v?v.split("-").reverse().join("/"):"Sem leitura";
export function CompactTirePreview(){
 const [rows,setRows]=useState<TireCaseRow[]>([]),[id,setId]=useState(""),[error,setError]=useState(""),[loaded,setLoaded]=useState(false),[page,setPage]=useState(0),[focus,setFocus]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch("/api/frota/pneus/cases",{cache:"no-store",signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.cases);setId((d.cases as TireCaseRow[]).find(r=>r.id===new URLSearchParams(window.location.search).get("cliente"))?.id??(d.cases as TireCaseRow[]).find(r=>r.data.client.name.toUpperCase().includes("HMYL"))?.id??d.cases[0]?.id??"");setLoaded(true);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
 useEffect(()=>{if(!focus)return;const close=(e:KeyboardEvent)=>{if(e.key==="Escape")setFocus(false);};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);},[focus]);
 const mapRef=useRef<HTMLDivElement>(null);
 const [links,setLinks]=useState<{id:string;x1:number;y1:number;x2:number;y2:number}[]>([]);
 useEffect(()=>{
  const map=mapRef.current;if(!map)return;
  const update=()=>{
   const bounds=map.getBoundingClientRect();
   const cards=Array.from(map.querySelectorAll<HTMLElement>("[data-tire-card]"));
   const next=Array.from(map.querySelectorAll<SVGGraphicsElement>("[data-tire-point]")).flatMap(point=>{
    const card=cards.find(card=>card.dataset.tireCard===point.dataset.tirePoint);if(!card)return [];
    const a=card.getBoundingClientRect(),b=point.getBoundingClientRect();
    const left=a.left<b.left;
    return [{id:point.dataset.tirePoint!,x1:(left?a.right:a.left)-bounds.left,y1:a.top+a.height/2-bounds.top,x2:b.left+b.width/2-bounds.left,y2:b.top+b.height/2-bounds.top}];
   });
   setLinks(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };
  update();const observer=new ResizeObserver(update);observer.observe(map);
  map.querySelectorAll("[data-tire-card],figure").forEach(el=>observer.observe(el));
  return()=>observer.disconnect();
 },[rows,id,page,focus]);
 const row=rows.find(r=>r.id===id),c=row?.data;
 const group=c?.tires.slice(page*4,page*4+4)??[];
 const vehicle=c?.vehicle.toLowerCase()??"";
 const truck=/6\s*[x×]\s*2/.test(vehicle)?"/images/tire-cases/truck.png":/4\s*[x×]\s*2/.test(vehicle)?"/images/tire-cases/truck-4x2.webp":null;
 const shared=group.length>1&&new Set(group.map(t=>{const r=treadProjection(t,c!.events);return JSON.stringify([t.mountedAt,t.mountedKm,t.cost,t.initialDepth,t.projectedLifeKm,r.reading?.date,r.reading?.km,r.reading?.depth,r.reading?.depthBasis,r.limit,r.status,t.brand,t.model,t.size,t.life,t.treadBrand,t.treadModel]);})).size===1;
 const applicationOnly=group.every(t=>!c?.events.some(e=>e.tireId===t.id));
 const rigid8x2=/8\s*[x×]\s*2/.test(vehicle)&&/ba[uú]/i.test(vehicle);
 const rigidConfig:Configuration={label:"Caminhão baú 8x2",kind:"caminhao",body:"bau",axes:[{role:"direcional",wheels:2,gap:1},{role:"direcional",wheels:2,gap:1},{role:"tração",wheels:4,gap:2},{role:"auxiliar",wheels:4,gap:1}]};
 const pages=Math.ceil((c?.tires.length??0)/4);

 function tireCard(t:typeof group[number]){const r=treadProjection(t,c!.events);return <div key={t.id} data-tire-card={t.id} className={styles.tire}><div className={styles.tireIdentity} style={t.code.length>10?{flexWrap:"wrap",whiteSpace:"normal"}:undefined}><b><span className={styles.wheel}>◉</span> Nº {t.code.replace(/\s*\(provisório\)/gi,"")}</b><span><b>DOT:</b> {t.dot||"—"}</span></div><span>{r.reading?.position||t.position}</span><strong>{t.life==="1ª recapagem"?"1 - ":""}{[t.brand,t.model].filter(Boolean).join(" · ")||t.product}{t.life==="1ª recapagem"?" · 1º RCP":t.life==="2ª recapagem"?" · 2º RCP":t.life==="Novo"?" · Novo":""}</strong>{(t.treadBrand||t.treadModel)&&<strong>{[t.treadBrand,t.treadModel].filter(Boolean).join(" - ")}</strong>}<span><b>Medida:</b> {t.size||"Não informada"}</span></div>;}
 return <div className={styles.page}>
 <h1>Prévia · ficha compacta de acompanhamento</h1><p>Exemplo com dados salvos. Esta tela não altera o cadastro.</p>
 {error&&<p role="alert">{error}</p>}{!loaded&&!error&&<p>Carregando clientes…</p>}
 <div className={styles.actions}><label>Cliente <select value={id} onChange={e=>{setId(e.target.value);setPage(0);}}>{rows.map(r=><option key={r.id} value={r.id}>{r.data.client.name} · {r.data.plate}</option>)}</select></label><a href="/acompanhamento-pneus">Cadastro e edição</a><a href="/acompanhamento-pneus/mapeamento">Pré-cadastro e mapeamento</a><a href="/acompanhamento-pneus/previa/mapeamento">Fichas dos clientes de mapeamento</a>{c&&<button onClick={()=>setFocus(true)}>Abrir só a ficha para print</button>}</div>
 {loaded&&!c&&<p>Nenhum acompanhamento salvo.</p>}
 {c&&row&&<><div className={styles.actions}>{pages>1&&<><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Ficha {page+1} de {pages}</span><button disabled={page===pages-1} onClick={()=>setPage(p=>p+1)}>Próxima</button></>}</div>
 <div className={focus?styles.overlay:undefined} role={focus?"dialog":undefined} aria-modal={focus||undefined} aria-label={focus?"Ficha para captura de tela":undefined}>
 {focus&&<button className={styles.close} onClick={()=>setFocus(false)}>Voltar · Esc</button>}
 <article className={styles.sheet}>
 <TireSheetBrand/>
 <div className={styles.content}>
 <TireSheetIdentity name={c.client.name} plate={c.plate} vehicle={c.vehicle} segment={c.operation}/>
 <TireSheetTimeline stages={tireSheetTimeline(group,c.events)}/>
 <div ref={mapRef} className={styles.map}><svg className={styles.connectors} aria-hidden="true">{links.map(link=><g key={link.id}><path d={`M ${link.x1} ${link.y1} H ${link.x1+(link.x2-link.x1)*.35} L ${link.x2} ${link.y2}`}/></g>)}</svg><div>{group.filter(t=>/esquer/i.test(treadProjection(t,c.events).reading?.position||t.position)).map(tireCard)}</div><figure>{rigid8x2?<div className={styles.configuredCompact}><ConfiguredVehicle config={rigidConfig} height={330} axisY={[65,125,240,290]} compact/><svg viewBox="0 0 160 330" aria-hidden="true">{group.map(t=>{const p=t.position.toLowerCase();const left=p.includes("esquer"),inner=p.includes("intern");return <circle key={t.id} data-tire-point={t.id} cx={left?(inner?29:12):(inner?129:146)} cy={240} r={4} fill="transparent"/>;})}</svg></div>:truck?<svg viewBox="0 0 220 330" role="img" aria-label={`Ilustração da configuração ${c.vehicle}`}><image href={truck} width="220" height="330"/>{/6\s*[x×]\s*2/.test(vehicle)&&group.map(t=>{const p=(treadProjection(t,c.events).reading?.position||t.position).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();const left=p.includes("esquer"),right=p.includes("direit"),inner=/intern|dentro/.test(p),outer=/extern|fora/.test(p);if(!p.includes("tracao")||(!left&&!right)||(!inner&&!outer))return null;return <ellipse data-tire-point={t.id} key={t.id} cx={220*(left?(inner ? .33 : .25):(inner ? .67 : .75))} cy={330*.72} rx="9" ry="17" fill="transparent" stroke="none"><title>{t.code} · {t.position}</title></ellipse>;})}</svg>:<div className={styles.pending}>Desenho da configuração a confirmar</div>}<figcaption>Frente ↑ · desenho ilustrativo</figcaption></figure><div>{group.filter(t=>!/esquer/i.test(treadProjection(t,c.events).reading?.position||t.position)).map(tireCard)}</div></div>
 {applicationOnly?<section className={styles.projection}><b>Aplicação registrada · aguardando primeira inspeção</b><span>{group.length} pneus cadastrados. O sulco inicial informado está registrado na aplicação acima.</span><span>Rodagem, rendimento por milímetro, média mensal e projeção serão calculados após uma inspeção com data, odômetro e sulco medido.</span></section>:<><h3>Resultado registrado · {tireSheetTimeline(group,c.events).filter(s=>s.label!=="Aplicação").at(-1)?.label||"Aguardando inspeção"}</h3>
 <div className={`${styles.results} ${shared?styles.shared:""}`}>{(shared?group.slice(0,1):group).map(t=>{const r=treadProjection(t,c.events);return <section key={t.id}>
 <div className={styles.resultDate}>Data da inspeção: <b>{date(r.reading?.date)}</b>{!shared&&<> · Nº {t.code}</>}</div>
 <div className={styles.metrics}><span className={styles.distanceMetric}>Rodagem registrada<strong>{number(r.distance)} km</strong></span><span>Sulco inicial → atual<strong>{number(t.initialDepth,1)} → {number(r.reading?.depth,1)} mm</strong></span><span>Período acompanhado<strong>{number(r.days)} dias · ≈ {number(r.days==null?null:r.days/30,1)} meses</strong></span></div>
 <div className={styles.yieldMetric}><div><span>Rendimento por milímetro de borracha</span><strong>{number(r.kmPerMm)} km/mm</strong></div><div><span>Rodagem média por mês</span><strong>{number(r.monthly)} km/mês</strong><small>Base: mês de 30 dias</small></div></div>
 <p>Desgaste: {number(r.wear,1)} mm · Compra por pneu: {t.costInformed===false?"Não informado":"R$ "+number(t.cost,2)} · Custo parcial: {t.costInformed!==false&&r.distance&&r.distance>0?`R$ ${number(t.cost/r.distance,4)}/km`:"sem base"} · Sulco {r.reading?.depthBasis==="conjunto"?"informado para o conjunto":"individual / origem conforme registro"}</p>
 <div className={styles.projection}><span>PROJEÇÃO · RODAGEM TOTAL ESTIMADA</span><strong className={styles.projectedTotal}>{number(r.total)} km</strong><b>Restante estimado: mais {number(r.remaining)} km · aproximadamente {number(r.months,2)} meses</b><span>Referência comercial: {number(t.projectedLifeKm)} km · Retirada de referência: {number(r.limit,1)} mm</span></div>
 </section>;})}</div></>}
 <footer>{applicationOnly?"Somente aplicação registrada. Ainda não há inspeção ou resultado de desempenho. ":""}{!applicationOnly&&<>Projeção referente à inspeção visual e à medição de sulco na data da inspeção indicada acima. O rendimento observado mostra quantos quilômetros o pneu rodou por milímetro de borracha consumido. Ainda não é o resultado final: mantendo esse ritmo de desgaste e de uso, o pneu poderá atingir o total estimado. A estimativa deve ser atualizada nas próximas inspeções.</>} Revisão {row.version} · Ficha {page+1}/{pages}. {group.some(t=>/provisório/i.test(t.code))&&"Códigos provisórios não substituem números de fogo. "}{group.some(t=>t.life==="Outra")&&"Histórico de recapagem a confirmar. "} Confira autorização do cliente antes de publicar.</footer>
 </div></article></div>
 <p>Os campos completos e o PDF continuam em “Cadastro e edição”. A ficha usa as medições registradas de cada pneu; dados ausentes aparecem como “—”.</p></>}
 </div>;
}
