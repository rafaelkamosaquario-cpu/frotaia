import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehicleTires } from "@/services/supabase/vehicleTireService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { PneusClient } from "./PneusClient";
import { tireCaseAccess } from "@/services/supabase/tireCaseAccess";
import Link from "next/link";

/** O layout de src/app/frota já garante o acesso. Painel e WhatsApp (gerenciar_pneu_veiculo) usam os mesmos services (vehicleTireService.ts), sempre a mesma fonte de dado. */
export default async function PneusPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [pneus, veiculos] = await Promise.all([
    listVehicleTires(supabase, { companyId: access.company.id }),
    listVehiclesForPanel(supabase, access.company.id),
  ]);

  const privateAccess = await tireCaseAccess();
  return <>{privateAccess && <div className="mx-4 mt-4 rounded-xl border border-border bg-surface p-4"><Link className="font-semibold text-primary" href="/frota/pneus/acompanhamento">Acompanhamento de clientes e CPK →</Link><p className="text-sm text-muted-foreground">Área exclusiva do administrador · RodoCore / Frota IA</p></div>}<PneusClient pneusIniciais={pneus} veiculos={veiculos} /></>;
}
