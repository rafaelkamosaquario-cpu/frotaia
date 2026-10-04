import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isConsultant } from "@/lib/frota/consultancy";
import { ConsultancyClient } from "./ConsultancyClient";
export default async function Page() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login?next=/consultoria");
  if (!isConsultant(user)) redirect("/empresas");
  return <ConsultancyClient />;
}
