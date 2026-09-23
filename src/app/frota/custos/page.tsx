import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { CostsClient } from "./CostsClient";

export default async function CostsPage() {
  const db = await createClient(); const access = await loadFleetPanelAccess(db);
  if (!access.ok) return null;
  if (!["owner", "admin", "operator"].includes(access.role)) return <p>Seu perfil não tem acesso a custos e remunerações.</p>;
  const [drivers, vehicles] = await Promise.all([listDriversForPanel(db, access.company.id), listVehiclesForPanel(db, access.company.id)]);
  return <CostsClient drivers={drivers.map(d => ({ id: d.id, name: d.name }))} vehicles={vehicles.map(v => ({ id: v.id, name: v.plate || v.name || "Veículo" }))} />;
}
