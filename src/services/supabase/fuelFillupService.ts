import { fuelFillupCreateSchema, fuelFillupUpdateSchema } from "@/lib/validation/schemas";
import type { FuelFillupRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

export interface ListFuelFillupsFilter {
  companyId: string;
  vehicleId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function listFuelFillups(client: SupabaseDbClient, filter: ListFuelFillupsFilter): Promise<FuelFillupRow[]> {
  let query = client
    .from("fuel_fillups")
    .select("*")
    .eq("company_id", filter.companyId)
    .order("fillup_date", { ascending: false })
    .limit(filter.limit ?? 50);

  if (filter.vehicleId) query = query.eq("vehicle_id", filter.vehicleId);
  if (filter.dateFrom) query = query.gte("fillup_date", filter.dateFrom);
  if (filter.dateTo) query = query.lte("fillup_date", filter.dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getFuelFillup(client: SupabaseDbClient, fillupId: string): Promise<FuelFillupRow | null> {
  const { data, error } = await client.from("fuel_fillups").select("*").eq("id", fillupId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createFuelFillup(client: SupabaseDbClient, companyId: string, userId: string, input: unknown): Promise<FuelFillupRow> {
  const parsed = fuelFillupCreateSchema.parse(input);

  const { data, error } = await client
    .from("fuel_fillups")
    .insert({
      company_id: companyId,
      vehicle_id: parsed.vehicleId,
      driver_id: parsed.driverId,
      vendor_id: parsed.vendorId,
      fillup_date: parsed.fillupDate,
      liters: parsed.liters,
      price_per_liter: parsed.pricePerLiter,
      total_amount: parsed.totalAmount,
      odometer_km: parsed.odometerKm,
      fuel_type: parsed.fuelType,
      notes: parsed.notes,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** `companyId` sempre exigido no filtro — mesmo princípio de vendorService/savedRouteService: nunca confiar só num id vindo do modelo. */
export async function updateFuelFillup(
  client: SupabaseDbClient,
  fillupId: string,
  companyId: string,
  userId: string,
  input: unknown
): Promise<FuelFillupRow> {
  const parsed = fuelFillupUpdateSchema.parse(input);

  const { data, error } = await client
    .from("fuel_fillups")
    .update({
      vehicle_id: parsed.vehicleId,
      driver_id: parsed.driverId,
      vendor_id: parsed.vendorId,
      fillup_date: parsed.fillupDate,
      liters: parsed.liters,
      price_per_liter: parsed.pricePerLiter,
      total_amount: parsed.totalAmount,
      odometer_km: parsed.odometerKm,
      fuel_type: parsed.fuelType,
      notes: parsed.notes,
      updated_by: userId,
    })
    .eq("id", fillupId)
    .eq("company_id", companyId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Hard delete (mesmo padrão de deleteExpense) — abastecimento é um lançamento pontual, não tem ciclo de vida "ativo/inativo" como veículo/fornecedor/rota. A despesa vinculada (se houver) não é apagada junto: expenses.fuel_fillup_id vira null (on delete set null), preservando o histórico financeiro. */
export async function deleteFuelFillup(client: SupabaseDbClient, fillupId: string, companyId: string): Promise<void> {
  const { error } = await client.from("fuel_fillups").delete().eq("id", fillupId).eq("company_id", companyId);
  if (error) throw error;
}

export interface AverageFuelConsumptionResult {
  vehicleId: string;
  litrosConsiderados: number;
  kmRodado: number;
  /** Nulo quando não há pelo menos 2 abastecimentos com odometer_km informado no período — nunca estimado. */
  consumoMedioKmL: number | null;
  abastecimentosNoPeriodo: number;
  abastecimentosComKm: number;
  gastoTotal: number;
  primeiraData: string | null;
  ultimaData: string | null;
}

/**
 * Consumo médio MEDIDO (litros/km real), método "tanque cheio a tanque
 * cheio": para cada par de abastecimentos consecutivos com odometer_km
 * informado, o km rodado é a diferença de odômetro e os litros
 * consumidos nesse trecho são os litros colocados no abastecimento
 * SEGUINTE (não no primeiro do par — é o que reabastece o que foi
 * gasto). Precisa de pelo menos 2 leituras de odômetro no período;
 * abastecimentos sem odometer_km entram no gasto total mas não no
 * cálculo de consumo (nunca interpola/estima um km que não foi informado).
 */
export async function computeAverageFuelConsumption(
  client: SupabaseDbClient,
  companyId: string,
  vehicleId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AverageFuelConsumptionResult> {
  let query = client
    .from("fuel_fillups")
    .select("*")
    .eq("company_id", companyId)
    .eq("vehicle_id", vehicleId)
    .order("fillup_date", { ascending: true });

  if (dateFrom) query = query.gte("fillup_date", dateFrom);
  if (dateTo) query = query.lte("fillup_date", dateTo);

  const { data, error } = await query;
  if (error) throw error;
  const todos = data ?? [];

  const gastoTotal = arredondar(
    todos.reduce((acc, r) => acc + Number(r.total_amount), 0),
    2
  );
  const comKm = todos.filter((r) => r.odometer_km !== null);

  let kmRodado = 0;
  let litrosConsiderados = 0;
  for (let i = 1; i < comKm.length; i++) {
    const delta = Number(comKm[i].odometer_km) - Number(comKm[i - 1].odometer_km);
    if (delta > 0) {
      kmRodado += delta;
      litrosConsiderados += Number(comKm[i].liters);
    }
  }

  return {
    vehicleId,
    litrosConsiderados: arredondar(litrosConsiderados, 2),
    kmRodado: arredondar(kmRodado, 1),
    consumoMedioKmL: litrosConsiderados > 0 ? arredondar(kmRodado / litrosConsiderados, 2) : null,
    abastecimentosNoPeriodo: todos.length,
    abastecimentosComKm: comKm.length,
    gastoTotal,
    primeiraData: todos[0]?.fillup_date ?? null,
    ultimaData: todos[todos.length - 1]?.fillup_date ?? null,
  };
}
