import { LogoMark } from "@/components/icons/Logo";
import { Card } from "@/components/ui/Card";

/**
 * Destino de quem tem acesso ao painel (fleet_panel_enabled=true) mas a
 * empresa ainda não conectou a Agenda Google — obrigatória pra usar o
 * painel (decisão do Rafael, unificação de identidade WhatsApp+Painel).
 * Fica FORA de src/app/frota (que herda o layout gated) pra não criar loop
 * de redirect — mesmo motivo de frota-indisponivel/page.tsx.
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
          Pra usar o painel Frota IA e manter lembretes, jornadas, manutenções e vencimentos sincronizados, conecte a
          Agenda Google da sua empresa.
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
