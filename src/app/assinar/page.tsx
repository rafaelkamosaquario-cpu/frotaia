import { createAdminClient } from "@/lib/supabase/admin";
import { getCompany } from "@/services/supabase/companyService";
import { verifyCheckoutLinkToken } from "@/services/whatsapp/checkoutLinkToken";
import { InvalidSignedTokenError } from "@/lib/security/signedToken";
import { CheckoutGate } from "./CheckoutGate";
import { LogoMark } from "@/components/icons/Logo";
import { Card } from "@/components/ui/Card";

/**
 * Gate de contratação (08/2026, nova estrutura comercial) — página PÚBLICA,
 * sem login/Google/painel. Só existe pra mostrar o resumo do plano (com
 * upsell do Individual, ou escolha de forma de pagamento do Gestão Anual)
 * antes de ir pro checkout real do Mercado Pago. O acesso é pelo link
 * assinado gerado pela tool `gerenciar_assinatura` — nunca aceita
 * companyId/plano/preço direto por query string pública (ver
 * checkoutLinkToken.ts e assinar/actions.ts).
 */
export default async function AssinarPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return <ErroLink mensagem="Link inválido — falta o token de contratação." />;
  }

  let payload;
  try {
    payload = verifyCheckoutLinkToken(token);
  } catch (err) {
    const mensagem =
      err instanceof InvalidSignedTokenError && err.message.includes("expirado")
        ? "Esse link expirou. Volte no WhatsApp e peça pra assinar de novo — é rapidinho."
        : "Link inválido ou já utilizado.";
    return <ErroLink mensagem={mensagem} />;
  }

  const admin = createAdminClient();
  const company = await getCompany(admin, payload.companyId);

  if (!company) {
    return <ErroLink mensagem="Não encontramos sua empresa. Volte no WhatsApp e peça pra assinar de novo." />;
  }

  return <CheckoutGate companyId={company.id} companyName={company.name} planoPreSelecionado={payload.planoPreSelecionado} />;
}

function ErroLink({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 text-center">
        <LogoMark className="mx-auto mb-3 size-9" />
        <p className="text-sm text-muted-foreground">{mensagem}</p>
      </Card>
    </div>
  );
}
