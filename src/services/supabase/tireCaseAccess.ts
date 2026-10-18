import "server-only";
import {createClient} from "@/lib/supabase/server";
import {loadFleetPanelAccess} from "./fleetPanelAccess";
import {privateCaseAllowed} from "@/lib/frota/tireCases";
export async function tireCaseAccess(){
  const db=await createClient(); const access=await loadFleetPanelAccess(db);
  if(!access.ok) return null;
  const {data:{user}}=await db.auth.getUser();
  return privateCaseAllowed(user?.email,user?.email_confirmed_at,access.role,access.company.id,process.env.TIRE_CASES_COMPANY_ID)?access:null;
}
