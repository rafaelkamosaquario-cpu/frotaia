import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCustomerContext } from "@/ai/context/customerContext";
import { checkCalendarConnection } from "@/services/google/googleCalendarService";
import { isCustomerPanelEnabled } from "@/lib/featureFlags";
import { HomeClient } from "./HomeClient";
import { Card } from "@/components/ui/Card";
import { LogoMark } from "@/components/icons/Logo";

const MENSAGEM_ERRO_CALENDAR: Record<string, string> = {
  nao_configurado: "A integração com o Google Calendar ainda não está configurada neste ambiente.",
  link_invalido: "O link de conexão expirou ou já foi usado. Peça um novo link direto pelo WhatsApp.",
  login_necessario: "Não conseguimos identificar sua conta. Peça um novo link de conexão pelo WhatsApp.",
  cancelado: "A autorização foi cancelada — você não concluiu o consentimento no Google.",
  parametros_ausentes: "O Google não devolveu os dados esperados. Tente novamente.",
  state_invalido: "A conexão expirou no meio do processo. Peça um novo link direto pelo WhatsApp.",
  falha_conexao: "Não foi possível concluir a conexão com o Google agora.",
};

/** Retorno do OAuth do Google Calendar (/auth/calendar/callback). Renderizado ANTES de qualquer redirect de login/painel porque quem conecta a Agenda pelo link do WhatsApp normalmente nunca teve sessão no painel (V1 é WhatsApp-only) — sem isso, cai direto no /login sem ver nenhum resultado (bug real encontrado em 06/08/2026: o usuário concluía o login no Google e via uma tela sem feedback nenhum). */
function CalendarConnectionResult({ sucesso, erro }: { sucesso: boolean; erro?: string }) {
  const mensagem = sucesso
    ? "Sua Agenda Google foi conectada com sucesso."
    : (erro && MENSAGEM_ERRO_CALENDAR[erro]) || "Não foi possível concluir a conexão com a Agenda Google.";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full text-2xl" aria-hidden>
          {sucesso ? "✅" : "⚠️"}
        </div>
        <h1 className="text-lg font-semibold text-foreground">{sucesso ? "Agenda conectada!" : "Não deu pra conectar"}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{mensagem}</p>
        <p className="mt-5 text-sm text-muted-foreground">Pode voltar pro WhatsApp — é só chamar o Frota IA de novo por lá.</p>
      </Card>
    </div>
  );
}

/**
 * Painel web (V1 centrada no WhatsApp — Camada 6): a experiência do
 * cliente comum é 100% pelo WhatsApp agora. Esta rota continua existindo
 * (nada foi removido) para administração/testes/V2 — com
 * CUSTOMER_PANEL_ENABLED=false, só quem tem profiles.is_admin=true entra.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ calendar_conectado?: string; calendar_erro?: string }>;
}) {
  const params = await searchParams;
  if (params.calendar_conectado || params.calendar_erro) {
    return <CalendarConnectionResult sucesso={!!params.calendar_conectado} erro={params.calendar_erro} />;
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  const context = await loadCustomerContext(supabase, data.user.id);

  if (!isCustomerPanelEnabled() && !context.profile?.is_admin) {
    redirect("/login?painel_indisponivel=1");
  }

  if (!context.company) {
    redirect("/onboarding");
  }

  // Veiculo e opcional (mesmo principio do onboarding via WhatsApp: coleta
  // progressiva, perguntada sob demanda pela IA quando uma ferramenta
  // precisar — ver systemPrompt.ts). Nunca gatear a entrada no painel por
  // ele existir ou nao, senao "Cadastrar depois" (skipVehicleAction) vira
  // um loop infinito com o redirect de onboarding/page.tsx.
  const calendarConnected = await checkCalendarConnection(data.user.id)
    .then((status) => status.connected)
    .catch(() => false);

  return <HomeClient calendarConnected={calendarConnected} />;
}
