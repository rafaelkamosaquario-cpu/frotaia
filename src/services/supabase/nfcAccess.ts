import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "./fleetPanelAccess";
import { isConsultant } from "@/lib/frota/consultancy";
import { createAdminClient } from "@/lib/supabase/admin";

// Both confirmed administrative identity and access to the selected company
// are required. A tag is an identifier, never an authentication credential.
export async function nfcAccess() {
  const db = await createClient();
  const {data: {user}} = await db.auth.getUser();
  if (!isConsultant(user)) return null;
  const access = await loadFleetPanelAccess(db);
  if (!access.ok || !["owner", "admin"].includes(access.role)) return null;
  if (access.role !== "owner") {
    const grant = await createAdminClient().from("consultancy_onboardings").select("consultant_until")
      .eq("company_id", access.company.id).eq("consultant_id", access.userId).maybeSingle();
    if (grant.error || !grant.data || (grant.data.consultant_until && new Date(grant.data.consultant_until) <= new Date())) return null;
  }
  return access;
}
