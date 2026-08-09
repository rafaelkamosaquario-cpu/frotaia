import { LogoMark } from "@/components/icons/Logo";
import { Card } from "@/components/ui/Card";

/**
 * Destino de quem tenta acessar /frota sem fleet_panel_enabled=true. Fica
 * FORA de src/app/frota (que herda o layout gated) para não criar loop de
 * redirect. Entitlement é 100% manual por enquanto (sem checkout da V2
 * ainda) — só orienta a falar com o Frota IA pelo WhatsApp.
 */
export default function FrotaIndisponivelPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Painel de gestão de frota</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Essa área é exclusiva de quem contratou o plano de gestão de frota do Frota IA.
        </p>
        <p className="mt-5 text-sm text-muted-foreground">
          Fala com o Frota IA pelo WhatsApp pra saber como contratar.
        </p>
      </Card>
    </div>
  );
}
