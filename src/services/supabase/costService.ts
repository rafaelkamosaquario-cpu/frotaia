import type { SupabaseDbClient } from "./types";
import { assertCompanyReferences, InvalidCompanyReference } from "./companyReferences";
import { calculateCost, costRuleSchema, generateCostSchema, type CostOperation, type CostRuleRow, type CostEntry } from "@/lib/frota/costs";
import { readAllPages } from "./readAllPages";

export async function listCosts(db: SupabaseDbClient, companyId: string, month: string) {
  const operations = await readAllPages<CostOperation>(async (offset, size) => {
    const { data, error } = await db.from("cost_operations").select("*").eq("company_id", companyId).order("id").range(offset, offset + size - 1);
    if (error) throw error; return data ?? [];
  });
  const rules = await readAllPages<CostRuleRow>(async (offset, size) => {
    const { data, error } = await db.from("cost_rules").select("*").eq("company_id", companyId).order("id").range(offset, offset + size - 1);
    if (error) throw error; return data ?? [];
  });
  const entries = await readAllPages<CostEntry>(async (offset, size) => {
    const { data, error } = await db.from("cost_entries").select("*").eq("company_id", companyId).eq("month", month).order("id").range(offset, offset + size - 1);
    if (error) throw error; return data ?? [];
  });
  return { operations, rules, entries };
}

export async function saveCostRule(db: SupabaseDbClient, companyId: string, raw: unknown, id?: string) {
  const definition = costRuleSchema.parse(raw);
  await assertCompanyReferences(db, companyId, { vehicles: definition.vehicleId, drivers: definition.driverId });
  for (const allocation of definition.allocations) {
    const { data, error } = await db.from("cost_operations").select("id").eq("company_id", companyId).eq("id", allocation.operationId).maybeSingle();
    if (error) throw error; if (!data) throw new InvalidCompanyReference();
  }
  const query = id ? db.from("cost_rules").update({ definition }).eq("id", id).eq("company_id", companyId) : db.from("cost_rules").insert({ company_id: companyId, definition });
  const { data, error } = await query.select("*").single();
  if (error) throw error; return data;
}

export async function generateCost(db: SupabaseDbClient, companyId: string, raw: unknown) {
  const input = generateCostSchema.parse(raw);
  const { data: rule, error } = await db.from("cost_rules").select("*").eq("company_id", companyId).eq("id", input.ruleId).single();
  if (error) throw error;
  if (!rule.active) throw new Error("Cadastro arquivado.");
  const definition = costRuleSchema.parse(rule.definition);
  if (definition.method !== "fixed" && !input.note) throw new Error("Informe a origem da base de cálculo para conferência.");
  const calculation = calculateCost(definition, input.month, input.base);
  const operationNames: Record<string, string> = {};
  for (const a of definition.allocations) {
    const { data, error: opError } = await db.from("cost_operations").select("name").eq("id", a.operationId).eq("company_id", companyId).single();
    if (opError) throw opError; operationNames[a.operationId] = data.name;
  }
  const { data, error: insertError } = await db.from("cost_entries").insert({ company_id: companyId, rule_id: rule.id,
    month: input.month, snapshot: { ...definition, base: input.base, note: input.note, calculation, operationNames },
    amount: calculation.amount, due_date: calculation.dueDate }).select("*").single();
  if (insertError) throw insertError; return data;
}
