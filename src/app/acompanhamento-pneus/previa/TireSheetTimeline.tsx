import type {TireSheetStage} from "@/lib/frota/tireSheetTimeline";
import styles from "./preview.module.css";
export function TireSheetTimeline({stages}:{stages:TireSheetStage[]}){
 return <section aria-label="Histórico de aplicação e inspeções">
  <div className={styles.ribbon}>SITUAÇÃO REGISTRADA</div>
  <ol className={styles.timeline}>{stages.map((s,i)=><li key={`${s.label}-${s.date}-${s.km}-${i}`}>
   <div><b>{s.label}</b><strong>{s.date.split("-").reverse().join("/")}</strong></div>
   <p>Odômetro: <b>{s.km.toLocaleString("pt-BR")} km</b>{s.depth!=null&&<> · {s.label==="Aplicação"?"Sulco inicial":"Sulco registrado"}: <b>{s.depth.toLocaleString("pt-BR")} mm</b></>}</p>
   {!!s.codes?.length&&<small>{s.codes.join(" · ")}</small>}
  </li>)}</ol>
 </section>;
}
