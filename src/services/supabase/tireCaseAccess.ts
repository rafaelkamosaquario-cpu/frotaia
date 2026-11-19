import "server-only";
import {attachCompanyScope} from "@/lib/frota/companyScope";
import {isConsultant} from "@/lib/frota/consultancy";
import {createClient} from "@/lib/supabase/server";
import {loadFleetPanelAccess} from "./fleetPanelAccess";
import {privateCaseAllowed} from "@/lib/frota/tireCases";
export async function tireCaseAccess(){
  const db=await createClient();
  const {data:{user}}=await db.auth.getUser();
  if(!isConsultant(user)||!process.env.TIRE_CASES_COMPANY_ID)return null;
  // Private workspace is fixed server-side; never change the selected customer cookie.
  attachCompanyScope(db,process.env.TIRE_CASES_COMPANY_ID);
  const access=await loadFleetPanelAccess(db);
  if(!access.ok) return null;
  return privateCaseAllowed(user?.email,user?.email_confirmed_at,access.role,access.company.id,process.env.TIRE_CASES_COMPANY_ID)?access:null;
}
