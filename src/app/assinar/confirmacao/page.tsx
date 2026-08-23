import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { LogoMark } from "@/components/icons/Logo";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { isOfertaPlano, CATALOGO_OFERTAS } from "@/lib/mercadopago/catalog";

/** Página é server component (lê searchParams no servidor) — Button.tsx não tem variante "link", então replica aqui só a classe visual de um botão grande, primário ou outline. */
function BotaoLink({ href, variant = "primary", children }: { href: string; variant?: "primary" | "outline"; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center rounded-full px-6 text-base font-medium transition-colors duration-150",
        variant === "primary"
          ? "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm shadow-primary/20"
          : "border border-border bg-transparent text-foreground hover:bg-surface-muted"
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Tela pública de retorno do Mercado Pago (`back_urls`/`back_url` em
 * mercadopago/client.ts) — só exibe texto, nunca decide nem confirma nada
 * por conta própria. O entitlement de verdade é sempre resolvido pelo
 * webhook (server-to-server), não por esta página — por isso o texto aqui
 * é sempre "seu pagamento está sendo processado" quando o resultado não é
 * um sucesso explícito, nunca "seu plano já está ativo" sem confirmação.
 *
 * `resultado`/`plano` na URL são só pra escolher qual texto mostrar —
 * nunca concedem nada por si só (ver actions.ts/webhook, que nunca leem
 * estes parâmetros).
 */

const NUMERO_WHATSAPP = "5541997454382";

function linkWhatsapp(mensagem: string): string {
  return `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

export default async function ConfirmacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string; plano?: string }>;
}) {
  const { resultado, plano: planoBruto } = await searchParams;
  const plano = planoBruto && isOfertaPlano(planoBruto) ? planoBruto : null;
  const ehGestao = plano ? CATALOGO_OFERTAS[plano].painel : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <LogoMark className="mx-auto mb-4 size-9" />

        {resultado === "sucesso" ? (
          <>
            <CheckCircle2 className="mx-auto mb-3 size-8 text-success" aria-hidden />
            <h1 className="mb-1 text-base font-semibold text-foreground">Pagamento confirmado</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              {ehGestao
                ? "Seu Frota IA Gestão está ativo."
                : "Seu Frota IA Individual está ativo."}
            </p>
            {ehGestao ? (
              <>
                <p className="mb-4 text-sm text-muted-foreground">Agora você pode ativar seu Painel de Gestão pelo WhatsApp.</p>
                <BotaoLink href={linkWhatsapp("ativar painel")}>Ativar Painel pelo WhatsApp</BotaoLink>
              </>
            ) : (
              <BotaoLink href={linkWhatsapp("")}>Voltar para o WhatsApp</BotaoLink>
            )}
          </>
        ) : resultado === "pendente" ? (
          <>
            <Clock className="mx-auto mb-3 size-8 text-warning" aria-hidden />
            <h1 className="mb-1 text-base font-semibold text-foreground">Pagamento em processamento</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              Assim que for confirmado (pode levar alguns minutos, principalmente no Pix), seu plano é ativado automaticamente.
            </p>
            <BotaoLink href={linkWhatsapp("")} variant="outline">Voltar para o WhatsApp</BotaoLink>
          </>
        ) : resultado === "falha" ? (
          <>
            <XCircle className="mx-auto mb-3 size-8 text-danger" aria-hidden />
            <h1 className="mb-1 text-base font-semibold text-foreground">Pagamento não aprovado</h1>
            <p className="mb-5 text-sm text-muted-foreground">Volte no WhatsApp e peça pra assinar de novo — é rapidinho.</p>
            <BotaoLink href={linkWhatsapp("quero assinar")} variant="outline">Voltar para o WhatsApp</BotaoLink>
          </>
        ) : (
          <>
            <Clock className="mx-auto mb-3 size-8 text-muted-foreground" aria-hidden />
            <h1 className="mb-1 text-base font-semibold text-foreground">Estamos confirmando seu pagamento</h1>
            <p className="mb-5 text-sm text-muted-foreground">Assim que for aprovado, seu plano é ativado automaticamente — sem precisar fazer mais nada.</p>
            <BotaoLink href={linkWhatsapp("")} variant="outline">Voltar para o WhatsApp</BotaoLink>
          </>
        )}
      </Card>
    </div>
  );
}
