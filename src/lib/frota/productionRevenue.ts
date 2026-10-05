import type { MonthlyProduction } from "./productionGoals";

export type ProductionRevenue = ReturnType<typeof summarizeProductionRevenue>;
/** Read-only summary of recorded revenues. Never derives money from tonnes or creates entries. */
export function summarizeProductionRevenue(
  rows: Pick<MonthlyProduction, "vehicle_id" | "operation">[],
  revenues: { id: string; vehicle_id: string | null; amount: number }[],
) {
  const operations = new Map(rows.map(r => [r.vehicle_id, r.operation]));
  const byVehicle: Record<string, { amount: number; count: number }> = {};
  const cents = { transporte: 0, carregamento: 0, outros: 0 };
  const seen = new Set<string>();
  for (const revenue of revenues) {
    if (seen.has(revenue.id)) continue;
    seen.add(revenue.id);
    const value = Math.round(revenue.amount * 100);
    const operation = revenue.vehicle_id ? operations.get(revenue.vehicle_id) : undefined;
    cents[operation ?? "outros"] += value;
    if (revenue.vehicle_id) {
      const bucket = byVehicle[revenue.vehicle_id] ??= { amount: 0, count: 0 };
      bucket.amount += value; bucket.count++;
    }
  }
  for (const bucket of Object.values(byVehicle)) bucket.amount /= 100;
  return { transport: cents.transporte / 100, loading: cents.carregamento / 100, other: cents.outros / 100,
    total: (cents.transporte + cents.carregamento + cents.outros) / 100, count: seen.size, byVehicle };
}

export function productionMonthRange(month: string) {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${last}` };
}
