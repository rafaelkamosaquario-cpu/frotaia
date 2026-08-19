import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAccountLinkToken } from "@/services/whatsapp/accountLinkToken";
import { loadCustomerContext } from "@/ai/context/customerContext";
import { getCompany } from "@/services/supabase/companyService";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/icons/Logo";

/**
 * Tela de confirmação explícita pro vínculo WhatsApp↔Painel quando o
 * usuário Google já é dono de outra empresa própria — nunca funde
 * automaticamente (ver /auth/account/link/route.ts). Confirmar aqui só
 * ADICIONA a empresa do WhatsApp como mais uma (o usuário já suporta
 * multiempresa nativamente); não mexe na empresa padrão atual.
 */
export default async function ConfirmAccountLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const { link } = await searchParams;
  if (!link) redirect("/?vinculo_erro=link_ausente");

  let payload;
  try {
    payload = verifyAccountLinkToken(link);
  } catch {
    redirect("/?vinculo_erro=link_invalido");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent(`/auth/account/confirm?link=${link}`)}`);
  }

  const context = await loadCustomerContext(supabase, data.user.id);
  if (!context.company) redirect(`/auth/account/link?link=${encodeURIComponent(link)}`);
  if (context.company.id === payload.companyId) redirect("/frota/dashboard?vinculo=ja_feito");

  const admin = createAdminClient();
  const empresaWhatsapp = await getCompany(admin, payload.companyId);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Vincular empresa do WhatsApp?</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sua conta já é dona de <strong className="text-foreground">{context.company.name}</strong> no Frota IA.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Quer também vincular{" "}
          <strong className="text-foreground">{empresaWhatsapp?.name ?? "a empresa do WhatsApp"}</strong> a essa
          mesma conta? Nada da empresa atual muda — as duas ficam acessíveis, sem misturar dados.
        </p>

        <form action="/api/auth/account/confirm" method="POST" className="mt-6 flex flex-col gap-2">
          <input type="hidden" name="link" value={link} />
          <Button type="submit" className="w-full">
            Sim, vincular as duas
          </Button>
          <a
            href="/frota/dashboard"
            className="mt-1 text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Não, continuar só com {context.company.name}
          </a>
        </form>
      </Card>
    </div>
  );
}
