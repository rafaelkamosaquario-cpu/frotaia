import type { SupabaseDbClient } from "./types";

type CompanyTable = "vehicles" | "drivers" | "analysis_runs" | "conversations" | "maintenance_schedules" | "fuel_fillups";
export class InvalidCompanyReference extends Error {
  readonly code = "INVALID_COMPANY_REFERENCE";
  constructor() { super("O registro vinculado não pertence à empresa ou não existe."); }
}
export async function assertCompanyReferences(client: SupabaseDbClient, companyId: string,
  references: Partial<Record<CompanyTable, string | null | undefined>>) {
  for (const [table, id] of Object.entries(references)) {
    if (!id) continue;
    const { data, error } = await client.from(table as CompanyTable).select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
    if (error) throw error;
    if (!data) throw new InvalidCompanyReference();
  }
}
