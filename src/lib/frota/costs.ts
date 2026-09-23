import { z } from "zod";

export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "Informe o mês de referência.");
const money = z.number().finite().min(0).max(100000000).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, "Use até duas casas decimais.");
export const costRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(["salario", "pro_labore", "seguro", "aluguel", "rastreador", "administrativo", "outro"]),
  person: z.string().trim().max(120).default(""),
  driverId: z.uuid().nullable().default(null),
  vehicleId: z.uuid().nullable().default(null),
  method: z.enum(["fixed", "percent", "unit", "fixed_percent", "fixed_unit"]),
  fixed: money.default(0),
  rate: money.default(0),
  unit: z.string().trim().max(40).default(""),
  basis: z.enum(["realizado", "recebido", "producao"]).default("realizado"),
  startMonth: monthSchema,
  endMonth: monthSchema.nullable().default(null),
  dueDay: z.number().int().min(1).max(31),
  dueMonthOffset: z.number().int().min(0).max(1).optional(),
  allocations: z.array(z.object({ operationId: z.uuid(), percent: z.number().finite().positive().max(100).multipleOf(0.01) })).max(30).default([]),
}).strict().superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (r.endMonth && r.endMonth < r.startMonth) fail("O fim não pode ser anterior ao início.");
  if (r.method.includes("fixed") && r.fixed <= 0) fail("Informe o valor fixo.");
  if (r.method !== "fixed" && r.rate <= 0) fail("Informe o percentual ou valor por unidade.");
  if (r.method.includes("percent") && r.rate > 100) fail("O percentual não pode ultrapassar 100%.");
  if (r.method.includes("unit") && !r.unit) fail("Informe a unidade de produção.");
  if (["salario", "pro_labore"].includes(r.category) && !r.person && !r.driverId) fail("Informe a pessoa ou selecione o motorista.");
  if (new Set(r.allocations.map(a => a.operationId)).size !== r.allocations.length) fail("Não repita uma operação.");
  if (r.allocations.length && Math.abs(r.allocations.reduce((s, a) => s + a.percent, 0) - 100) > 0.00001) fail("A divisão entre operações deve somar 100%.");
});
export type CostRule = z.infer<typeof costRuleSchema>;
export const categories: Record<CostRule["category"], string> = { salario: "Salário", pro_labore: "Pró-labore / retirada", seguro: "Seguro", aluguel: "Aluguel", rastreador: "Rastreador", administrativo: "Administrativo", outro: "Outro custo" };
export const methods: Record<CostRule["method"], string> = { fixed: "Fixo mensal", percent: "Comissão percentual", unit: "Por produção", fixed_percent: "Fixo + comissão", fixed_unit: "Fixo + produção" };
export const generateCostSchema = z.object({ ruleId: z.uuid(), month: monthSchema, base: z.number().finite().min(0).max(100000000).multipleOf(0.001).default(0), note: z.string().trim().max(1000).default("") }).strict();

export function calculateCost(rule: CostRule, month: string, base: number) {
  costRuleSchema.parse(rule); monthSchema.parse(month);
  if (month < rule.startMonth || (rule.endMonth && month > rule.endMonth)) throw new Error("Mês fora da vigência do cadastro.");
  if (!Number.isFinite(base) || base < 0 || base > 100000000) throw new Error("Base inválida.");
  const fixedCents = rule.method.includes("fixed") ? Math.round(rule.fixed * 100) : 0;
  if (Math.abs(base * 1000 - Math.round(base * 1000)) > 0.0001) throw new Error("Use até três casas decimais na base.");
  const numerator = BigInt(Math.round(base * 1000)) * BigInt(Math.round(rule.rate * 100));
  const divisor = BigInt(rule.method.includes("percent") ? 100000 : 1000);
  const variableCents = rule.method === "fixed" ? 0 : Number((numerator + divisor / BigInt(2)) / divisor);
  const cents = fixedCents + variableCents;
  if (cents <= 0 || cents > 10000000000) throw new Error("O valor calculado deve ser positivo e estar dentro do limite.");
  // Largest remainder distribution conserves every cent, including three-way splits.
  const parts = rule.allocations.map(a => ({ ...a, cents: Math.floor(cents * a.percent / 100), remainder: (cents * a.percent / 100) % 1 }));
  const ordered = [...parts].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0, left = cents - parts.reduce((s, p) => s + p.cents, 0); parts.length && i < left; i++) ordered[i % ordered.length].cents++;
  const [year, m] = month.split("-").map(Number);
  const dueMonthDate = new Date(Date.UTC(year, m - 1 + (rule.dueMonthOffset ?? 0), 1));
  const dueMonth = dueMonthDate.toISOString().slice(0, 7);
  const lastDay = new Date(Date.UTC(dueMonthDate.getUTCFullYear(), dueMonthDate.getUTCMonth() + 1, 0)).getUTCDate();
  return { amount: cents / 100, fixed: fixedCents / 100, variable: variableCents / 100,
    dueDate: `${dueMonth}-${String(Math.min(rule.dueDay, lastDay)).padStart(2, "0")}`,
    allocations: parts.map(p => ({ operationId: p.operationId, percent: p.percent, amount: p.cents / 100 })) };
}

export interface CostOperation { id: string; company_id: string; name: string; created_at: string }
export interface CostRuleRow { id: string; company_id: string; definition: CostRule; active: boolean; created_at: string }
export interface CostEntry { id: string; company_id: string; rule_id: string; month: string; snapshot: CostRule & { base: number; note: string; calculation: ReturnType<typeof calculateCost>; operationNames: Record<string,string> }; amount: number; due_date: string; expense_id: string | null; paid_on: string | null; created_at: string }
