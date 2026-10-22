import {notFound} from "next/navigation";
import {tireCaseAccess} from "@/services/supabase/tireCaseAccess";
import {TireInventoryClient} from "./TireInventoryClient";
export default async function Page(){if(!await tireCaseAccess())notFound();return <TireInventoryClient/>;}

