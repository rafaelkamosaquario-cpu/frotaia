import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompanyAccessClient } from "./CompanyAccessClient";
export default async function EmpresasPage(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login?next=/empresas");
 return <CompanyAccessClient />;
}
