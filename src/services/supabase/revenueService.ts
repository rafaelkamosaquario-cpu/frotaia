import type { RevenueRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";
import { readAllPages } from "./readAllPages";
import { assertCompanyReferences } from "./companyReferences";

export interface RecordRevenueInput {
  companyId: string;
  userId: string;
  conversationId?: string;
  vehicleId?: string;
  driverId?: string;
  /** Análise de frete que originou a receita, quando houver — só rastreabilidade, nunca populado automaticamente a partir de uma simulação. */
  analysisRunId?: string;
  amount: number;
  /** Data da receita (não a data de registro) — YYYY-MM-DD. */
  revenueDate: string;
  description?: string;
}

export async function recordRevenue(client: SupabaseDbClient, input: RecordRevenueInput): Promise<RevenueRow> {
  await assertCompanyReferences(client, input.companyId, { vehicles: input.vehicleId, drivers: input.driverId,
    analysis_runs: input.analysisRunId, conversations: input.conversationId });
  const { data, error } = await client
    .from("revenues")
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      conversation_id: input.conversationId,
      vehicle_id: input.vehicleId,
      driver_id: input.driverId,
      analysis_run_id: input.analysisRunId,
      amount: input.amount,
      revenue_date: input.revenueDate,
      description: input.description,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export interface ListRevenuesFilter {
  /** Internal reporting option; paginates the whole selected period. */
  all?: boolean;
  offset?: number;
  companyId: string;
  vehicleId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function listRevenues(client: SupabaseDbClient, filter: ListRevenuesFilter): Promise<RevenueRow[]> {
  if (filter.all) return readAllPages((offset, size) => listRevenues(client, { ...filter, all: false, offset, limit: size }));
  let query = client
    .from("revenues")
    .select("*")
    .eq("company_id", filter.companyId)
    .order("revenue_date", { ascending: false })
    .order("id", { ascending: false });

  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.dateFrom) query = query.gte("revenue_date", filter.dateFrom);
  if (filter.dateTo) query = query.lte("revenue_date", filter.dateTo);

  const { data, error } = await query.range(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50) - 1);
  if (error) throw error;
  return data ?? [];
}

export interface UpdateRevenueInput {
  vehicleId?: string | null;
  driverId?: string | null;
  amount?: number;
  revenueDate?: string;
  description?: string;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateExpense/updateMaintenanceSchedule. */
export async function updateRevenue(client: SupabaseDbClient, revenueId: string, companyId: string, input: UpdateRevenueInput): Promise<RevenueRow> {
  await assertCompanyReferences(client, companyId, { vehicles: input.vehicleId, drivers: input.driverId });
  const { data, error } = await client
    .from("revenues")
    .update({
      vehicle_id: input.vehicleId,
      driver_id: input.driverId,
      amount: input.amount,
      revenue_date: input.revenueDate,
      description: input.description,
    })
    .eq("id", revenueId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Hard delete — mesmo padrão de deleteExpense (receita é lançamento pontual, sem ciclo de vida "ativo/inativo"). */
export async function deleteRevenue(client: SupabaseDbClient, revenueId: string, companyId: string): Promise<void> {
  const { error } = await client.from("revenues").delete().eq("id", revenueId).eq("company_id", companyId);
  if (error) throw error;
}
