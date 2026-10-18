import {notFound} from "next/navigation";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {TireCasesClient} from "./TireCasesClient";
export default async function Page(){if(!await tireCaseAccess())notFound();return <TireCasesClient/>;}
