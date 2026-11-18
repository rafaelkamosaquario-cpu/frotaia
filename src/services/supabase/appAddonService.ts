import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubscription, isAccessAllowed, isFleetPanelAccessAllowed } from "./subscriptionService";
import type { AddonState } from "@/lib/individual/addon";
import { addonAllowed } from "@/lib/individual/addon";
// These tables/RPCs are server-only. No browser client can grant an entitlement.
export function addonDb(): SupabaseClient { return createAdminClient() as unknown as SupabaseClient; }
export async function getAppAddonState(companyId: string): Promise<AddonState> {
  const admin = createAdminClient();
  const [subscription, company, result] = await Promise.all([
    getSubscription(admin, companyId),
    admin.from("companies").select("fleet_panel_enabled").eq("id", companyId).single(),
    addonDb().rpc("individual_app_state", { p_company: companyId }),
  ]);
  if (company.error) throw company.error;
  const enterprise = !!company.data.fleet_panel_enabled || isFleetPanelAccessAllowed(subscription);
  if (enterprise) return { allowed: true, baseActive: true, preserved: true, until: null };
  if (result.error) throw result.error;
  const baseActive = isAccessAllowed(subscription) && subscription?.status === "ATIVA" && subscription?.plan !== "TRIAL";
  const preserved = result.data?.preserved === true;
  const until = typeof result.data?.until === "string" ? result.data.until : null;
  return { baseActive, preserved, until, allowed: addonAllowed(baseActive, preserved, until) };
}
