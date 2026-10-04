import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyAccessClient } from "./CompanyAccessClient";
import { isConsultant } from "@/lib/frota/consultancy";
export default async function EmpresasPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login?next=/empresas");
 if(user.app_metadata?.consultancy_company){
  const state=await db.rpc("consultancy_first_access",{p_complete:false});
  if(state.error||(state.data as {pending?:boolean}|null)?.pending)redirect("/acesso-cliente");
 }
 return <CompanyAccessClient canProvision={isConsultant(user)} />;
}
