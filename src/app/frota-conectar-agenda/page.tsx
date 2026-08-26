import { LogoMark } from "@/components/icons/Logo";
import { Card } from "@/components/ui/Card";

/**
 * Página standalone de conexão da Agenda Google — usada como destino do
 * link "conectar agora" no resumo do onboarding do painel e na tela
 * /frota/agenda quando desconectada. Fica FORA de src/app/frota, mesmo
 * padrão de frota-indisponivel/page.tsx (evita herdar layout gated).
 *
 * Fechamento de coerência (08/2026): Google Calendar DEIXOU de ser
 * obrigatório pra usar o painel (só a tela Agenda depende dele de
 * verdade) — o texto abaixo reflete isso, nunca mais afirma que é
 * requisito pro painel inteiro.
 */
export default function ConectarAgendaPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Conecte sua Agenda Google</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pra usar a Agenda do Frota IA e manter compromissos, lembretes e vencimentos sincronizados, conecte a Agenda
          Google da sua empresa. O resto do painel funciona normalmente sem isso.
        </p>
        <a
          href="/auth/calendar/connect"
          className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors duration-150 hover:bg-primary-hover"
        >
          Conectar Google Agenda
        </a>
      </Card>
    </div>
  );
}
