import { z } from "zod";
import type { FuelChoice, FuelEvidence } from "./fuelGroup";

export const truckFlowSchema = z.object({
  version: z.literal(1), startedAt: z.iso.datetime(),
  liters: z.number().positive().max(100000).nullable().default(null),
  meter: z.number().nonnegative().max(100000000).nullable().default(null),
  plate: z.string().max(20).nullable().default(null),
  confirmed: z.object({ liters: z.boolean(), meter: z.boolean(), plate: z.boolean() }),
  page: z.number().int().nonnegative().default(0),
  equipmentMode: z.boolean().optional(),
  equipmentId: z.uuid().nullable().optional(),
}).strict();
export type TruckFlow = z.infer<typeof truckFlowSchema>;
export type TruckField = "liters" | "meter" | "plate";
export type TruckButton = { id: string; label: string };
export const newTruckFlow = (now = new Date()): TruckFlow => ({ version: 1, startedAt: now.toISOString(), liters: null, meter: null, plate: null, confirmed: { liters: false, meter: false, plate: false }, page: 0 });
export const truckField = (s: TruckFlow): TruckField | null => (s.equipmentMode ? ["liters", "plate"] as const : ["liters", "meter", "plate"] as const).find(f => !s.confirmed[f]) ?? null;
export const equipmentChoices = (vehicles: FuelChoice[]) => vehicles.filter(v => !v.plate || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(v.plate)) || /\b(trator|munck|munk|guincho|motosserra)\b/i.test(v.name));
export const flowVehicle = (s: TruckFlow, vehicles: FuelChoice[]) => s.equipmentMode ? equipmentChoices(vehicles).find(v => v.id === s.equipmentId) ?? null : truckVehicle(s.plate, vehicles);
export const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function truckVehicle(plate: string | null, vehicles: FuelChoice[]) {
  if (!plate) return null;
  const found = vehicles.filter(v => v.plate && normalizePlate(v.plate) === normalizePlate(plate));
  return found.length === 1 ? found[0] : null;
}
export function applyTruckEvidence(s: TruckFlow, e: FuelEvidence): TruckFlow {
  const next = structuredClone(s);
  if (!s.confirmed.liters && e.liters !== null) next.liters = e.liters;
  if (!s.confirmed.meter && e.meter !== null && e.meterKind === "km") next.meter = e.meter;
  if (!s.confirmed.plate && e.vehicle && /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(e.vehicle))) next.plate = normalizePlate(e.vehicle);
  return next;
}
/** Accept only actual readings; a plate must resolve inside this company. */
export function acceptTruckReadings(s: TruckFlow, vehicles: FuelChoice[]): TruckFlow {
  const next = structuredClone(s);
  if (next.equipmentMode) { next.meter = null; next.plate = null; }
  next.confirmed.liters = next.liters !== null && next.liters > 0;
  next.confirmed.meter = next.meter !== null && next.meter >= 0;
  next.confirmed.plate = !!flowVehicle(next, vehicles);
  return next;
}
/** Explicit corrections in the current step do not need an AI request. */
export function typedTruckEvidence(text: string, field: TruckField | null): Partial<FuelEvidence> | null {
  if (field === "plate") {
    const plate = normalizePlate(text.replace(/^placa\s*:?\s*/i, ""));
    return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate) ? { vehicle: plate } : null;
  }
  if (field !== "liters" && field !== "meter") return null;
  const raw = text.trim().replace(field === "liters" ? /\s*(litros?|l)$/i : /\s*km$/i, "").trim();
  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  const value = Number(normalized);
  return field === "liters" ? { liters: value } : { meter: value, meterKind: "km" };
}
export function truckToken(draft: string, revision: number, action: string) { return `fuel:${draft}:${revision}:${action}`; }
export function truckAction(token: string, draft: string, revision: number) {
  const prefix = truckToken(draft, revision, "");
  return token.startsWith(prefix) ? token.slice(prefix.length) : null;
}
export function confirmTruckField(s: TruckFlow, yes: boolean) {
  const next = structuredClone(s), field = truckField(s);
  if (!field || s[field] === null) return next;
  if (yes) next.confirmed[field] = true;
  else next[field] = null;
  return next;
}
export const truckLabel = (f: TruckField) => ({ liters: "Litragem", meter: "Odômetro", plate: "Placa" })[f];
export const truckRequest = (f: TruckField, again = false) => ({ liters: `Envie a foto da bomba${again ? " novamente" : ""} ou digite a litragem.`, meter: `Envie a foto do painel com o odômetro${again ? " novamente" : ""} ou digite a quilometragem.`, plate: `Envie a foto da placa${again ? " novamente" : ""} ou digite a placa do caminhão.` })[f];
/** Two people per page leaves a third reply button for navigation. No company vehicle list. */
export function truckPrompt(s: TruckFlow, vehicles: FuelChoice[], drivers: FuelChoice[], draft: string, revision: number): { message: string; buttons: TruckButton[] } {
  const field = truckField(s);
  if (s.equipmentMode && field === "plate") {
    const choices = equipmentChoices(vehicles);
    if (!choices.length) return { message: "Não há equipamentos sem placa identificados no cadastro desta empresa. Confira o cadastro no painel.", buttons: [] };
    const pages = Math.ceil(choices.length / 2), page = s.page % pages;
    const buttons = choices.slice(page * 2, page * 2 + 2).map(v => ({ id: truckToken(draft, revision, `equipment:${v.id}`), label: v.name.slice(0, 20) }));
    if (pages > 1) buttons.push({ id: truckToken(draft, revision, "more"), label: "Mais opções" });
    return { message: `Qual equipamento recebeu o combustível? Toque na opção ou digite o nome cadastrado.${pages > 1 ? ` (${page + 1}/${pages})` : ""}`, buttons };
  }
  if (field) {
    if (s[field] === null) return { message: truckRequest(field), buttons: [] };
    if (field === "plate" && !truckVehicle(s.plate, vehicles)) return { message: "A placa lida não corresponde a um caminhão cadastrado nesta empresa. Confira e digite a placa correta.", buttons: [] };
    const value = typeof s[field] === "number" ? s[field].toLocaleString("pt-BR") : s[field];
    return { message: `${truckLabel(field)}: ${value}${field === "liters" ? " litros" : field === "meter" ? " km" : ""}. Confirma?`, buttons: [{ id: truckToken(draft, revision, "yes"), label: "Sim" }, { id: truckToken(draft, revision, "no"), label: "Não" }] };
  }
  if (!drivers.length) return { message: "Não há condutores cadastrados nesta empresa. Confira o cadastro no painel.", buttons: [] };
  const pages = Math.ceil(drivers.length / 2), page = s.page % pages;
  const buttons = drivers.slice(page * 2, page * 2 + 2).map(d => ({ id: truckToken(draft, revision, `driver:${d.id}`), label: d.name.slice(0, 20) }));
  if (pages > 1) buttons.push({ id: truckToken(draft, revision, "more"), label: "Mais opções" });
  return { message: `Identifique-se como ${s.equipmentMode ? "responsável" : "condutor"} para concluir.${pages > 1 ? ` (${page + 1}/${pages})` : ""}`, buttons };
}

