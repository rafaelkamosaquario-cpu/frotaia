import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isConsultant } from "@/lib/frota/consultancy";
import { DirectSalesClient } from "./DirectSalesClient";
export default async function Page(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login?next=/contratacoes-diretas");
 if(!isConsultant(user))redirect("/empresas");
 return <DirectSalesClient/>;
}
