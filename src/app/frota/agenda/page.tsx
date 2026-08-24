import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listUpcomingEvents } from "@/services/google/googleCalendarService";
import { AgendaClient } from "./AgendaClient";

/**
 * Agenda visual (evolução funcional 08/2026) — primeira tela do painel que
 * mostra o Google Calendar de verdade. O layout de src/app/frota já garante
 * Calendar conectado (redireciona pra /frota-conectar-agenda antes de
 * chegar aqui), então não repete essa checagem. Google continua sendo a
 * ÚNICA fonte de verdade — nenhum evento é copiado pro banco do Frota IA.
 */
export default async function AgendaPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const hoje = new Date();
  const em30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  const resultado = await listUpcomingEvents({
    companyId: access.company.id,
    from: hoje.toISOString(),
    to: em30Dias.toISOString(),
    maxResults: 100,
  }).catch(() => ({ items: [] }));

  return <AgendaClient eventosIniciais={resultado.items} />;
}
