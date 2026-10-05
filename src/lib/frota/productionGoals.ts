import { z } from "zod";
import { monthSchema } from "./costs";

const quantity = z.number().finite().min(0).max(10000000).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001, "Use até três casas decimais.");
export const productionSchema = z.object({
  vehicle_id: z.uuid(), month: monthSchema,
  operation: z.enum(["transporte", "carregamento"]),
  target_tonnes: quantity.refine(n => n > 0, "A meta deve ser maior que zero.").nullable(),
  actual_tonnes: quantity.nullable(), diesel_liters: quantity.nullable(),
  measured_through: z.iso.date().nullable(),
  note: z.string().trim().max(1000), revision: z.number().int().positive().nullable(),
}).strict().superRefine((v, ctx) => {
  if (v.actual_tonnes !== null && !v.measured_through) ctx.addIssue({ code: "custom", message: "Informe até qual dia a produção foi apurada." });
  if (v.measured_through && v.measured_through.slice(0, 7) !== v.month) ctx.addIssue({ code: "custom", message: "A data de apuração deve pertencer ao mês selecionado." });
});
export type ProductionInput = z.infer<typeof productionSchema>;
export type MonthlyProduction = Omit<ProductionInput, "revision"> & { company_id: string; revision: number; updated_at: string };
export function brazilToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function goalProgress(row: Pick<MonthlyProduction, "month" | "target_tonnes" | "actual_tonnes" | "measured_through">, today: string) {
  const target = row.target_tonnes, actual = row.actual_tonnes;
  const percent = target && actual !== null ? actual / target * 100 : null;
  const missing = target && actual !== null ? Math.max(0, target - actual) : null;
  const lastDay = new Date(Date.UTC(Number(row.month.slice(0, 4)), Number(row.month.slice(5, 7)), 0)).getUTCDate();
  const closed = row.month < today.slice(0, 7) && row.measured_through === `${row.month}-${lastDay}`;
  let label = "Sem meta", tone: "neutral" | "success" | "danger" | "warning" = "neutral";
  if (target !== null) {
    if (row.month > today.slice(0, 7)) label = "Mês futuro";
    else if (actual === null) label = "Sem produção informada";
    else if (actual >= target) { label = "Meta atingida"; tone = "success"; }
    else if (closed) { label = "Abaixo da meta"; tone = "danger"; }
    else if (row.measured_through) {
      const expected = target * Number(row.measured_through.slice(8, 10)) / lastDay;
      label = actual >= expected ? "No ritmo da meta" : "Abaixo do ritmo";
      tone = actual >= expected ? "success" : "warning";
    } else label = "Apuração pendente";
  }
  return { percent, missing, label, tone, closed };
}
