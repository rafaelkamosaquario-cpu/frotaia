"use client";
import Image from "next/image";
import { VEHICLE_ILLUSTRATIONS } from "@/lib/frota/vehicleIllustrations";
export function VehicleIllustrationPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = VEHICLE_ILLUSTRATIONS.find(item => item.id === value);
  return <div className="rounded-lg border border-border p-3">
    <label htmlFor="illustrationKey" className="mb-1.5 block text-sm font-medium">Ilustração no painel</label>
    <select id="illustrationKey" className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Manter padrão atual</option>
      {VEHICLE_ILLUSTRATIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {selected?.image && <Image width={240} height={130} className="mx-auto h-32 w-auto object-contain" src={`/fleet-illustrations/${selected.image}`} alt={selected.label} />}
    <p className="mt-2 text-xs text-muted-foreground">Personalização visual desta empresa. Não altera eixos, capacidade ou outros dados técnicos.</p>
  </div>;
}
