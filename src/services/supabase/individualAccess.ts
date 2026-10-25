import "server-only";
import {createClient} from "@/lib/supabase/server";
import {loadCustomerContext} from "@/ai/context/customerContext";
import {getSubscription,isAccessAllowed} from "./subscriptionService";
import {readCompanyModules} from "./companyModulesService";
import {ALL_MODULE_IDS} from "@/lib/frota/companyModules";

export async function individualAccess() {
  const client=await createClient();
  const {data}=await client.auth.getUser();
  if(!data.user)return {ok:false as const,status:401};
  const context=await loadCustomerContext(client,data.user.id);
  if(!context.company || !["owner","admin"].includes(context.role??""))return {ok:false as const,status:403};
  if(!context.profile?.is_admin && !context.company.fleet_panel_enabled && !isAccessAllowed(await getSubscription(client,context.company.id)))return {ok:false as const,status:403};
  const modules=await readCompanyModules(context.company.id);
  return {ok:true as const,client,company:context.company,enabled:context.profile?.is_admin?ALL_MODULE_IDS:modules?.enabled??ALL_MODULE_IDS};
}
