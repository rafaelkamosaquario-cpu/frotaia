import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { listUpcomingEvents, checkCalendarConnection } from "@/services/google/googleCalendarService";
import { AgendaClient } from "./AgendaClient";

/**
 * Agenda visual (evolução funcional 08/2026) — a única tela do painel que
 * depende de verdade do Google Calendar (fechamento de coerência 08/2026:
 * o layout de src/app/frota deixou de exigir Calendar globalmente — 15 das
 * 17 telas do painel nunca tocam Google). Por isso esta tela agora checa a
 * conexão por conta própria, em vez de confiar num gate que não existe
 * mais — sem isso, "desconectado" seria mascarado como "sem eventos"
 * (`.catch(() => ({items: []}))` antigo). Google continua sendo a ÚNICA
 * fonte de verdade — nenhum evento é copiado pro banco do Frota IA.
 */
export default async function AgendaPage() {
  const supabase = await createClient();
  const access = await loadFleetPanelAccess(supabase);

  if (!access.ok) return null;

  const calendarStatus = await checkCalendarConnection(access.company.id).catch(() => ({ connected: false }));

  if (!calendarStatus.connected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">Conecte sua Agenda Google</h1>
        <p className="max-w-md text-sm text-muted-foreground">Pra ver e gerenciar seus compromissos aqui, conecte a Agenda Google da sua empresa.</p>
        <a href="/auth/calendar/connect" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Conectar Google Agenda
        </a>
      </div>
    );
  }

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
