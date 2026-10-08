import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CompanyModuleConfig } from "@/lib/frota/companyModules";

/** Call only after authenticated active membership has been established. Never accept an unchecked tenant from the browser. */
export async function readCompanyModules(companyId: string): Promise<CompanyModuleConfig | null> {
  const { data, error } = await createAdminClient().from("company_panel_modules").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw new Error("Não foi possível verificar os módulos da empresa. Tente novamente.");
  return data;
}
