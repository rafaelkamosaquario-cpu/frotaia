import { z } from "zod";

export const fuelEvidenceSchema = z.object({
  vehicle: z.string().trim().min(1).max(120).nullable(),
  driver: z.string().trim().min(1).max(120).nullable(),
  date: z.iso.date().nullable(),
  liters: z.number().finite().positive().max(100000).nullable(),
  meter: z.number().finite().nonnegative().max(100000000).nullable(),
  meterKind: z.enum(["km", "hours"]).nullable(),
}).strict();
export type FuelEvidence = z.infer<typeof fuelEvidenceSchema>;
export type FuelGroupDraft = { company_id: string; group_id: string; sender: string; draft_id: string; revision: number; evidence: Partial<FuelEvidence>; updated_at: string };
export const emptyFuelEvidence: FuelEvidence = { vehicle: null, driver: null, date: null, liters: null, meter: null, meterKind: null };
export type FuelChoice = { id: string; name: string; plate?: string | null };
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export function resolveFuelChoice(text: string | null, choices: FuelChoice[]) {
  if (!text) return null;
  const matches = choices.filter(c => [c.name, c.plate].some(s => s && normalize(s) === normalize(text)));
  return matches.length === 1 ? matches[0] : null;
}
/** No prices or cost fields enter the group reply. IDs are resolved only against this company's choices. */
export function reviewFuelEvidence(evidence: FuelEvidence, vehicles: FuelChoice[], drivers: FuelChoice[], confirmation: string) {
  const vehicle = resolveFuelChoice(evidence.vehicle, vehicles);
  const driver = resolveFuelChoice(evidence.driver, drivers);
  const missing: string[] = [];
  if (!vehicle) missing.push(`Placa/equipamento: ${vehicles.map(v => `${v.plate ? `${v.plate} — ` : ""}${v.name}`).join("; ") || "nenhum cadastrado"}`);
  if (evidence.meter === null || !evidence.meterKind) missing.push("Quilometragem total (não TRIP) ou horímetro, indicando qual leitura é.");
  if (evidence.liters === null) missing.push("Litros abastecidos.");
  if (!evidence.date) missing.push("Data do abastecimento (dia/mês/ano).");
  if (!driver) missing.push(`Condutor: ${drivers.map(d => d.name).join("; ") || "nenhum cadastrado"}`);
  if (missing.length) return { ready: false as const, message: `Recebi os dados deste abastecimento. Falta confirmar:\n${missing.join("\n")}\nEnvie os dados que faltam. Para outro abastecimento, escreva NOVO.` };
  return { ready: true as const, vehicleId: vehicle!.id, driverId: driver!.id, message: `Confira o abastecimento interno:\nVeículo: ${vehicle!.plate ?? vehicle!.name}\nCondutor: ${driver!.name}\nData: ${evidence.date}\n${evidence.meterKind === "km" ? "Quilometragem total" : "Horímetro"}: ${evidence.meter}\nLitros: ${evidence.liters}\nResponda CONFIRMAR ${confirmation}, ou envie a correção. Para descartar, escreva CANCELAR. Valores financeiros ficam apenas no painel.` };
}
