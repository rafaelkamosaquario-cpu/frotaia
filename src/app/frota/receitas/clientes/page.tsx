import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { ClientesClient } from "./ClientesClient";

export default async function ClientesPage() {
  const client = await createClient();
  const access = await loadFleetPanelAccess(client);
  if (!access.ok) return null;
  const { data, error } = await client.from("freight_customers").select("*").eq("company_id", access.company.id).order("name").limit(1000);
  if (error) throw error;
  return <ClientesClient initial={data ?? []} canEdit={["owner", "admin", "operator"].includes(access.role)} />;
}

