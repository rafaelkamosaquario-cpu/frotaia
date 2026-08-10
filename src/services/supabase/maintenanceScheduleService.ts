import { maintenanceScheduleCreateSchema, maintenanceScheduleUpdateSchema } from "@/lib/validation/schemas";
import type { MaintenanceScheduleRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export async function listMaintenanceSchedulesForPanel(
  client: SupabaseDbClient,
  companyId: string
): Promise<MaintenanceScheduleRow[]> {
  const { data, error } = await client
    .from("maintenance_schedules")
    .select("*")
    .eq("company_id", companyId)
    .order("due_date");
  if (error) throw error;
  return data ?? [];
}

export async function createMaintenanceSchedule(
  client: SupabaseDbClient,
  companyId: string,
  input: unknown
): Promise<MaintenanceScheduleRow> {
  const parsed = maintenanceScheduleCreateSchema.parse(input);

  const { data, error } = await client
    .from("maintenance_schedules")
    .insert({
      company_id: companyId,
      vehicle_id: parsed.vehicleId,
      type: parsed.type,
      due_date: parsed.dueDate,
      status: parsed.status,
      notes: parsed.notes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateDriver/updateVehicle. */
export async function updateMaintenanceSchedule(
  client: SupabaseDbClient,
  scheduleId: string,
  companyId: string,
  input: unknown
): Promise<MaintenanceScheduleRow> {
  const parsed = maintenanceScheduleUpdateSchema.parse(input);

  const { data, error } = await client
    .from("maintenance_schedules")
    .update({
      vehicle_id: parsed.vehicleId,
      type: parsed.type,
      due_date: parsed.dueDate,
      status: parsed.status,
      notes: parsed.notes,
    })
    .eq("id", scheduleId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
