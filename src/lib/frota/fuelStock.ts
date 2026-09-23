import { z } from "zod";

const positive = z.number().finite().positive().max(100000000);
const quantity = positive.refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001, "Use até três casas decimais para litros.");
const money = positive.refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, "Use até duas casas decimais no total.");
const base = { requestId: z.uuid(), date: z.iso.date() };
export const fuelStockCommand = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("purchase"), invoice: z.string().trim().min(1).max(100), supplier: z.string().trim().min(1).max(150), liters: quantity, total: money }).strict(),
  z.object({ ...base, kind: z.literal("withdrawal"), vehicleId: z.uuid(), driverId: z.uuid(), liters: quantity, meterKind: z.enum(["km", "hours"]), meter: z.number().finite().nonnegative().max(100000000) }).strict(),
]);
export type FuelStockCommand = z.infer<typeof fuelStockCommand>;
export type FuelStockBalance = { liters: number; value: number; average: number };
export type FuelBalanceRow = { company_id: string; liters: number; value: number; last_date: string | null; updated_at: string };
export type FuelMovementRow = { id: string; company_id: string; request_id: string; kind: "purchase" | "withdrawal"; movement_date: string; invoice: string | null; supplier: string | null; liters: number; amount: number; unit_cost: number; vehicle_id: string | null; driver_id: string | null; meter_kind: string | null; meter: number | null; fillup_id: string | null; created_by: string; created_at: string; command_json: FuelStockCommand };

/** Reference calculation for previews/tests. SQL numeric + row lock is authoritative. */
export function calculateFuelStock(balance: FuelStockBalance, liters: number, purchaseTotal?: number) {
  if (![balance.liters, balance.value, liters].every(Number.isFinite) || balance.liters < 0 || balance.value < 0 || liters <= 0) throw new Error("Valores inválidos.");
  if (purchaseTotal !== undefined) {
    if (!Number.isFinite(purchaseTotal) || purchaseTotal <= 0) throw new Error("Compra inválida.");
    const nextLiters = balance.liters + liters;
    const value = balance.value + purchaseTotal;
    return { liters: nextLiters, value, average: value / nextLiters, cost: purchaseTotal };
  }
  if (liters > balance.liters || balance.liters === 0) throw new Error("Estoque insuficiente.");
  const average = balance.value / balance.liters;
  const cost = liters === balance.liters ? balance.value : Math.round((liters * average + Number.EPSILON) * 100) / 100;
  if (cost <= 0) throw new Error("Custo calculado deve ser positivo.");
  const remaining = Math.round((balance.liters - liters) * 1000) / 1000;
  const value = Math.round((balance.value - cost) * 100) / 100;
  return { liters: remaining, value, average: remaining ? value / remaining : 0, cost };
}
