import styles from "./preview.module.css";

/** Shared identity for every compact client tire sheet. */
export function TireSheetBrand(){
 return <header className={styles.brand}><div><b>RODOCORE</b><span>CONSULTORIA · ACOMPANHAMENTO DE PNEUS</span></div></header>;
}
export function TireSheetIdentity({name,plate,vehicle,segment,configuration}:{name:string;plate:string;vehicle:string;segment?:string;configuration?:string}){
 return <>
  <h2 className={styles.clientName}><span>Empresa / Autônomo:</span> {name}</h2>
  <div className={styles.vehicleIdentity}><p><b>Placa:</b> {plate}</p><p><b>Marca / Modelo:</b> {vehicle}</p></div>
  <p className={styles.operation}><b>Segmento:</b> {segment?.trim()||"Não informado"}{configuration&&<><br/><b>Configuração:</b> {configuration}</>}</p>
 </>;
}
