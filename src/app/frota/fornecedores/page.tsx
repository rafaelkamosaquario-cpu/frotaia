import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVendors } from "@/services/supabase/vendorService";
import { FornecedoresClient } from "./FornecedoresClient";

/** O layout de src/app/frota já garante o acesso. Painel e WhatsApp (gerenciar_fornecedor) usam os mesmos services (vendorService.ts), sempre a mesma fonte de dado. */
export default async function FornecedoresPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const fornecedores = await listVendors(supabase, access.company.id);

  return <FornecedoresClient fornecedores={fornecedores} />;
}
