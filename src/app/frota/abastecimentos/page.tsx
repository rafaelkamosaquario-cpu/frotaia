import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listFuelFillups } from "@/services/supabase/fuelFillupService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVendors } from "@/services/supabase/vendorService";
import { AbastecimentosClient } from "./AbastecimentosClient";

/** O layout de src/app/frota já garante o acesso. Painel e WhatsApp (gerenciar_abastecimento) usam os mesmos services (fuelFillupService.ts), sempre a mesma fonte de dado. */
export default async function AbastecimentosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [abastecimentos, veiculos, motoristas, fornecedores] = await Promise.all([
    listFuelFillups(supabase, { companyId: access.company.id, limit: 200 }),
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
    listVendors(supabase, access.company.id),
  ]);

  return <AbastecimentosClient abastecimentosIniciais={abastecimentos} veiculos={veiculos} motoristas={motoristas} fornecedores={fornecedores} />;
}
