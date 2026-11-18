import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {isConsultant} from "@/lib/frota/consultancy";
import {RodoCoreAdminShell} from "@/components/frota/RodoCoreAdminShell";
import {CompanyAccessClient} from "@/app/empresas/CompanyAccessClient";
export default async function Page(){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)redirect("/login?next=/administracao");
  if(!isConsultant(user))redirect("/empresas");
  return <RodoCoreAdminShell><CompanyAccessClient canProvision dashboard/></RodoCoreAdminShell>;
}
