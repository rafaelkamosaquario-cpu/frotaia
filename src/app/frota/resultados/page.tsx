import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { ProductionGoals } from "../dashboard/ProductionGoals";
import "../dashboard/fleet-cards.css";

export default async function ResultsPage() {
  const db = await createClient();
  const access = await loadFleetPanelAccess(db);
  if (!access.ok) return null;
  const [vehicles, drivers] = await Promise.all([listVehiclesForPanel(db, access.company.id), listDriversForPanel(db, access.company.id)]);
  return <div className="space-y-6 p-4 md:p-6"><header><h1 className="text-2xl font-semibold">Resultado mensal</h1><p className="text-sm text-muted-foreground">Produção, metas, receitas e custos registrados da sua operação.</p></header><ProductionGoals companyId={access.company.id} vehicles={vehicles} drivers={drivers} /></div>;
}
