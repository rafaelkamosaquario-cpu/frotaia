import type { CompanyMemberRole } from "@/lib/supabase/tables";

/** Role comes from authenticated membership, never from model arguments. */
export function canExecuteFinancialTool(name: string, mode: unknown, role: CompanyMemberRole | null): boolean {
  if (name !== "registrar_receita" && name !== "registrar_despesa") return true;
  if (mode === "CONSULTAR") return role !== null;
  if (role === "owner" || role === "admin") return true;
  return role === "operator" && (mode === "REGISTRAR" || mode === "ATUALIZAR");
}
