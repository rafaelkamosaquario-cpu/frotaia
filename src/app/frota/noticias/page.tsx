import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { getOrCreatePreferences } from "@/services/supabase/companyPreferencesService";
import { getLatestNewsDigest } from "@/services/supabase/newsDigestArchiveService";
import { NoticiasClient } from "./NoticiasClient";

/** O layout de src/app/frota já garante o acesso. */
export default async function NoticiasPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const [preferencias, ultimoResumo] = await Promise.all([
    getOrCreatePreferences(supabase, access.company.id),
    getLatestNewsDigest(supabase),
  ]);

  return <NoticiasClient preferenciasIniciais={preferencias} ultimoResumo={ultimoResumo} podeEditar={access.role === "owner" || access.role === "admin"} />;
}
