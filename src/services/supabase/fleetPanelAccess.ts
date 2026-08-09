import { loadCustomerContext } from "@/ai/context/customerContext";
import type { CompanyMemberRole, CompanyRow } from "@/lib/supabase/tables";
import type { SupabaseDbClient } from "./types";

export type FleetPanelAccessResult =
  | { ok: true; userId: string; company: CompanyRow; role: CompanyMemberRole }
  | { ok: false; reason: "unauthenticated" | "no_company" | "not_entitled" };

/**
 * Gate de acesso ao painel V2 (gestão de frota) — controle de produto/UI,
 * não uma restrição de RLS sobre vehicles/drivers/etc. (essas continuam só
 * com is_company_member). Usado tanto pelo layout de src/app/frota quanto
 * pelas rotas de src/app/api/frota — árvores separadas no App Router, cada
 * uma precisa checar por conta própria.
 */
export async function loadFleetPanelAccess(client: SupabaseDbClient): Promise<FleetPanelAccessResult> {
  const { data } = await client.auth.getUser();
  if (!data.user) return { ok: false, reason: "unauthenticated" };

  const context = await loadCustomerContext(client, data.user.id);
  if (!context.company) return { ok: false, reason: "no_company" };
  if (!context.company.fleet_panel_enabled) return { ok: false, reason: "not_entitled" };

  return { ok: true, userId: data.user.id, company: context.company, role: context.role! };
}
