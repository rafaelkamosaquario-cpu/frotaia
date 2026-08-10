import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listVehicleDocumentsForPanel } from "@/services/supabase/vehicleDocumentService";
import { listVehiclesForPanel } from "@/services/supabase/vehicleService";
import { listDriversForPanel } from "@/services/supabase/driverService";
import { DocumentosClient } from "./DocumentosClient";

/**
 * O layout de src/app/frota já garante o acesso — esta página busca os
 * dados iniciais no servidor. veiculos/motoristas buscam a lista COMPLETA
 * (não só ativos) pra exibir corretamente o dono de um documento mesmo que
 * ele tenha sido desativado depois; os subconjuntos ativos são derivados
 * no client só pras opções do formulário.
 */
export default async function DocumentosPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [documentosIniciais, veiculos, motoristas] = await Promise.all([
    listVehicleDocumentsForPanel(supabase, access.company.id),
    listVehiclesForPanel(supabase, access.company.id),
    listDriversForPanel(supabase, access.company.id),
  ]);

  return <DocumentosClient documentosIniciais={documentosIniciais} veiculos={veiculos} motoristas={motoristas} />;
}
