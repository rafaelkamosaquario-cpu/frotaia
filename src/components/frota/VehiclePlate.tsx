import styles from "./VehiclePlate.module.css";

/** Identificador textual selecionável; nunca transforma uma placa antiga em Mercosul. */
export function VehiclePlate({ plate }: { plate: string | null | undefined }) {
  const value = plate?.trim().toUpperCase();
  if (!value) return <span className="text-sm text-muted-foreground">Placa não informada</span>;
  const normalized = value.replace(/[-\s]/g, "");
  const mercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/.test(normalized);
  const legacy = /^[A-Z]{3}\d{4}$/.test(normalized);
  if (!mercosul && !legacy) return <span className="font-mono font-semibold">{value}</span>;
  return (
    <span className={`${styles.plate} ${legacy ? styles.legacy : ""}`} aria-label={`Placa ${value}`}>
      <span className={styles.country} aria-hidden="true">{mercosul ? "BRASIL" : "BR"}</span>
      <span className={styles.registration}>{legacy ? `${normalized.slice(0, 3)}-${normalized.slice(3)}` : normalized}</span>
    </span>
  );
}
