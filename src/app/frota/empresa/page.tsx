import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { EmpresaClient } from "./EmpresaClient";

/** O layout de src/app/frota já garante o acesso — access.company já é o registro completo. */
export default async function EmpresaPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  return <EmpresaClient empresaInicial={access.company} role={access.role} />;
}
