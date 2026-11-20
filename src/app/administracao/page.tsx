import {RodoCoreAppIdentity} from "@/components/frota/RodoCoreAppIdentity";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {isConsultant} from "@/lib/frota/consultancy";
import {RodoCoreAdminShell} from "@/components/frota/RodoCoreAdminShell";
import {CompanyAccessClient} from "@/app/empresas/CompanyAccessClient";
export const metadata = {title:"RodoCore Sistemas · Painel mestre"};
export default async function Page(){
  const db=await createClient();const {data:{user}}=await db.auth.getUser();
  if(!user)return <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground"><RodoCoreAppIdentity/><section className="max-w-sm rounded-2xl border border-border bg-surface p-8 text-center"><img src="/brand/rodocore/r-transparent-v1.png" alt="RodoCore" width="96" height="96" className="mx-auto mb-4"/><h1 className="text-2xl font-bold">RodoCore · Painel mestre</h1><p className="mt-3 text-muted-foreground">Entre com sua conta autorizada para acessar os clientes e a operação.</p><a href="/login?next=/administracao" className="mt-6 inline-block rounded-lg bg-primary px-5 py-3 text-primary-foreground">Entrar no painel</a></section></main>;
  if(!isConsultant(user))redirect("/empresas");
  return <RodoCoreAdminShell><CompanyAccessClient canProvision dashboard/></RodoCoreAdminShell>;
}
