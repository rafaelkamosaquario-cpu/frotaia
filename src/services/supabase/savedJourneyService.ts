import type { SavedJourneyRow, JourneyStatusEnum } from "@/lib/supabase/tables";
import { toJson } from "@/lib/supabase/json";
import type { SupabaseDbClient } from "./types";

export interface CreateSavedJourneyInput {
  companyId: string;
  createdByUserId: string;
  analysisRunId?: string;
  driverId?: string;
  vehicleId?: string;
  conversationId?: string;
  origin?: string;
  destination?: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  durationMinutes?: number;
  resultData: Record<string, unknown>;
  notes?: string;
}

export async function createSavedJourney(client: SupabaseDbClient, input: CreateSavedJourneyInput): Promise<SavedJourneyRow> {
  const { data, error } = await client
    .from("saved_journeys")
    .insert({
      company_id: input.companyId,
      created_by_user_id: input.createdByUserId,
      analysis_run_id: input.analysisRunId,
      driver_id: input.driverId,
      vehicle_id: input.vehicleId,
      conversation_id: input.conversationId,
      origin: input.origin,
      destination: input.destination,
      scheduled_departure: input.scheduledDeparture,
      scheduled_arrival: input.scheduledArrival,
      duration_minutes: input.durationMinutes,
      result_data: toJson(input.resultData),
      notes: input.notes,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listSavedJourneysForPanel(client: SupabaseDbClient, companyId: string): Promise<SavedJourneyRow[]> {
  const { data, error } = await client
    .from("saved_journeys")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getSavedJourney(client: SupabaseDbClient, journeyId: string): Promise<SavedJourneyRow | null> {
  const { data, error } = await client.from("saved_journeys").select("*").eq("id", journeyId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpdateSavedJourneyInput {
  status?: JourneyStatusEnum;
  actualDeparture?: string;
  actualArrival?: string;
  notes?: string;
}

/** companyId é filtro obrigatório (não só id) — mesmo princípio de updateMaintenanceSchedule/updateDriver. */
export async function updateSavedJourney(
  client: SupabaseDbClient,
  journeyId: string,
  companyId: string,
  input: UpdateSavedJourneyInput
): Promise<SavedJourneyRow> {
  const { data, error } = await client
    .from("saved_journeys")
    .update({
      status: input.status,
      actual_departure: input.actualDeparture,
      actual_arrival: input.actualArrival,
      notes: input.notes,
    })
    .eq("id", journeyId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
