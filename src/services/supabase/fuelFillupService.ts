import { fuelFillupCreateSchema, fuelFillupUpdateSchema } from "@/lib/validation/schemas";
import type { FuelFillupRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";
import { readAllPages } from "./readAllPages";

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
  /** Indicador condicionado a tanque cheio nos extremos; nunca telemetria. */
  qualidade: "estimado" | "insuficiente" | "inconsistente";
  aviso: string;
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
 * Indicador estimado entre primeira e última leitura. Inclui todos os litros
 * entre os extremos, exclui o abastecimento inicial e os posteriores à última
 * leitura. Não há confirmação de tanque cheio no cadastro: nunca chamar de
 * consumo medido. Leituras inconsistentes invalidam o resultado inteiro.
 */
export async function computeAverageFuelConsumption(
  client: SupabaseDbClient,
  companyId: string,
  vehicleId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<AverageFuelConsumptionResult> {
  const todos = await readAllPages<FuelFillupRow>(async (offset, size) => {
    let query = client
      .from("fuel_fillups")
      .select("*")
      .eq("company_id", companyId)
      .eq("vehicle_id", vehicleId)
      .order("fillup_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (dateFrom) query = query.gte("fillup_date", dateFrom);
    if (dateTo) query = query.lte("fillup_date", dateTo);

    const { data, error } = await query.range(offset, offset + size - 1);
    if (error) throw error;
    return data ?? [];
  });

  const gastoTotal = arredondar(
    todos.reduce((acc, r) => acc + Number(r.total_amount), 0),
    2
  );
  const comKm = todos.filter((r) => r.odometer_km != null);

  let kmRodado = 0;
  let litrosConsiderados = 0;
  let anterior: number | null = null;
  let litrosPendentes = 0;
  let inconsistente = false;
  for (const row of todos) {
    // Sem leitura inicial não há intervalo; depois dela TODOS os litros contam,
    // inclusive abastecimentos intermediários sem odômetro.
    if (anterior !== null) {
      const litros = Number(row.liters);
      if (!Number.isFinite(litros) || litros <= 0) inconsistente = true;
      litrosPendentes += litros;
    }
    if (row.odometer_km == null) continue;
    const km = Number(row.odometer_km);
    if (!Number.isFinite(km) || km < 0) inconsistente = true;
    if (anterior !== null) {
      const delta = km - anterior;
      if (delta <= 0) inconsistente = true;
      kmRodado += delta;
      litrosConsiderados += litrosPendentes;
    }
    anterior = km;
    litrosPendentes = 0;
  }
  if (inconsistente) { kmRodado = 0; litrosConsiderados = 0; }
  const qualidade = inconsistente ? "inconsistente" : litrosConsiderados > 0 ? "estimado" : "insuficiente";
  const aviso = inconsistente
    ? "Há odômetro repetido/retrocedendo ou litros inválidos. Corrija os registros antes de calcular o consumo."
    : qualidade === "insuficiente"
      ? "Informe pelo menos duas leituras de odômetro em abastecimentos para fechar um intervalo."
      : "Estimativa: o cálculo pressupõe tanque cheio nos extremos e todos os abastecimentos registrados. Sem essa confirmação, não é consumo medido. Litros sem km entre as leituras estão incluídos; fora do intervalo entram apenas no gasto.";

  return {
    qualidade,
    aviso,
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
