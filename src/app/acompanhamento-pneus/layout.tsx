import {redirect,notFound} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {RodoCoreAdminShell} from "@/components/frota/RodoCoreAdminShell";
export const metadata={title:"RodoCore · Acompanhamento de clientes e CPK"};
export default async function Layout({children}:{children:React.ReactNode}){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)redirect("/login?next=/acompanhamento-pneus");
  if(!await tireCaseAccess())notFound();
  return <RodoCoreAdminShell>{children}</RodoCoreAdminShell>;
}
