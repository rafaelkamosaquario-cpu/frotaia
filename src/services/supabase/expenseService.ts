import type { ExpenseRow, ExpenseTypeEnum } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export interface RecordExpenseInput {
  companyId: string;
  userId: string;
  conversationId?: string;
  vehicleId?: string;
  sourceMessageId?: string;
  /** Manutenção que originou esta despesa (custo informado ao concluir) — nunca informado pelo cliente/modelo diretamente, só pelo fluxo de conclusão de manutenção (ver syncMaintenanceExpense). */
  maintenanceScheduleId?: string;
  expenseType: ExpenseTypeEnum;
  amount: number;
  /** Data da despesa (não a data de registro) — YYYY-MM-DD. */
  expenseDate: string;
  vendor?: string;
  description?: string;
}

export async function recordExpense(client: SupabaseDbClient, input: RecordExpenseInput): Promise<ExpenseRow> {
  const { data, error } = await client
    .from("expenses")
    .insert({
      company_id: input.companyId,
      user_id: input.userId,
      conversation_id: input.conversationId,
      vehicle_id: input.vehicleId,
      source_message_id: input.sourceMessageId,
      maintenance_schedule_id: input.maintenanceScheduleId,
      expense_type: input.expenseType,
      amount: input.amount,
      expense_date: input.expenseDate,
      vendor: input.vendor,
      description: input.description,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export interface SyncMaintenanceExpenseInput {
  companyId: string;
  userId: string;
  maintenanceScheduleId: string;
  vehicleId: string;
  amount: number;
  expenseDate: string;
  description: string;
}

/**
 * Custo informado ao concluir uma manutenção vira/atualiza UMA despesa (categoria
 * "manutencao") vinculada por `maintenance_schedule_id` — nunca duplica: se a
 * manutenção já tem uma despesa vinculada (índice único parcial no banco garante
 * no máximo 1), atualiza o valor/data/veículo dela em vez de criar outra. Editar o
 * custo de uma manutenção já concluída sempre reaproveita a mesma despesa.
 */
export async function syncMaintenanceExpense(client: SupabaseDbClient, input: SyncMaintenanceExpenseInput): Promise<ExpenseRow> {
  const { data: existente, error: erroConsulta } = await client
    .from("expenses")
    .select("*")
    .eq("maintenance_schedule_id", input.maintenanceScheduleId)
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;

  if (existente) {
    return updateExpense(client, existente.id, input.companyId, {
      amount: input.amount,
      expenseDate: input.expenseDate,
      vehicleId: input.vehicleId,
    });
  }

  return recordExpense(client, {
    companyId: input.companyId,
    userId: input.userId,
    vehicleId: input.vehicleId,
    maintenanceScheduleId: input.maintenanceScheduleId,
    expenseType: "manutencao",
    amount: input.amount,
    expenseDate: input.expenseDate,
    description: input.description,
  });
}

export interface ListExpensesFilter {
  companyId: string;
  vehicleId?: string;
  expenseType?: ExpenseTypeEnum;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function listExpenses(client: SupabaseDbClient, filter: ListExpensesFilter): Promise<ExpenseRow[]> {
  let query = client
    .from("expenses")
    .select("*")
    .eq("company_id", filter.companyId)
    .order("expense_date", { ascending: false })
    .limit(filter.limit ?? 50);

  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.expenseType) query = query.eq("expense_type", filter.expenseType);
  if (filter.dateFrom) query = query.gte("expense_date", filter.dateFrom);
  if (filter.dateTo) query = query.lte("expense_date", filter.dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface UpdateExpenseInput {
  vehicleId?: string | null;
  expenseType?: ExpenseTypeEnum;
  amount?: number;
  expenseDate?: string;
  vendor?: string;
  description?: string;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateMaintenanceSchedule/updateDriver. */
export async function updateExpense(client: SupabaseDbClient, expenseId: string, companyId: string, input: UpdateExpenseInput): Promise<ExpenseRow> {
  const { data, error } = await client
    .from("expenses")
    .update({
      vehicle_id: input.vehicleId,
      expense_type: input.expenseType,
      amount: input.amount,
      expense_date: input.expenseDate,
      vendor: input.vendor,
      description: input.description,
    })
    .eq("id", expenseId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteExpense(client: SupabaseDbClient, expenseId: string, companyId: string): Promise<void> {
  const { error } = await client.from("expenses").delete().eq("id", expenseId).eq("company_id", companyId);
  if (error) throw error;
}

/** Despesas vinculadas a alguma manutenção (custo registrado ao concluir) — usado pela tela de Manutenção pra mostrar o custo sem duplicar a fonte de verdade (que continua sendo `expenses`). */
export async function listMaintenanceLinkedExpenses(client: SupabaseDbClient, companyId: string): Promise<ExpenseRow[]> {
  const { data, error } = await client
    .from("expenses")
    .select("*")
    .eq("company_id", companyId)
    .not("maintenance_schedule_id", "is", null);
  if (error) throw error;
  return data ?? [];
}
