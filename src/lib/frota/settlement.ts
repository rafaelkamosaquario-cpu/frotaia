import { z } from "zod";

export type SettlementStatus = "unknown" | "pending" | "settled";
export interface SettlementFields {
  settlement_status?: SettlementStatus;
  settled_on?: string | null;
  settlement_version?: number;
  settlement_updated_by?: string | null;
  settlement_note?: string | null;
}
export const settlementSchema = z.object({
  kind: z.enum(["expenses", "revenues"]),
  id: z.uuid(),
  status: z.enum(["pending", "settled"]),
  date: z.iso.date().nullable(),
  note: z.string().trim().min(5).max(500),
  version: z.number().int().min(0),
}).strict().superRefine((v, ctx) => {
  if (v.status !== "settled" && v.date) ctx.addIssue({code:"custom",message:"Pendente não pode ter data de baixa.",path:["date"]});
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if (v.date && v.date > today) ctx.addIssue({code:"custom",message:"Data de baixa não pode ser futura.",path:["date"]});
});
export function settlementLabel(row: SettlementFields, revenue = false) {
  if (row.settlement_status === "settled") return revenue ? "Recebida" : "Paga";
  if (row.settlement_status === "pending") return revenue ? "A receber" : "A pagar";
  return "Não informado";
}
export function settlementTotals(rows: (SettlementFields & {amount:number})[]) {
  const cents = {unknown:0,pending:0,settled:0};
  for (const row of rows) cents[row.settlement_status ?? "unknown"] += Math.round(row.amount * 100);
  return {unknown:cents.unknown/100,pending:cents.pending/100,settled:cents.settled/100};
}
