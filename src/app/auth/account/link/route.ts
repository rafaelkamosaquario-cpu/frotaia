import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAccountLinkToken } from "@/services/whatsapp/accountLinkToken";
import { loadCustomerContext } from "@/ai/context/customerContext";
import { linkUserToCompany } from "@/services/supabase/companyMemberService";
import { isUniqueViolation } from "@/lib/supabase/errors";

/**
 * Confirma o vínculo de identidade WhatsApp↔Painel: o link chega pelo
 * WhatsApp (gerado pela ferramenta `vincular_painel`), aberto já logado com
 * Google. Exige sessão ativa — se não tiver, redireciona pro login e volta
 * pra cá depois (mesmo padrão de /auth/whatsapp/connect).
 *
 * Nunca funde empresas automaticamente: se o usuário Google já tem uma
 * empresa própria diferente da do WhatsApp, manda pra uma tela de
 * confirmação explícita (/auth/account/confirm) em vez de vincular direto.
 */
export async function GET(request: Request) {
  const { searchParams, origin, pathname, search } = new URL(request.url);
  const appOrigin = process.env.APP_URL ?? origin;
  const link = searchParams.get("link");

  if (!link) {
    return NextResponse.redirect(`${appOrigin}/?vinculo_erro=link_ausente`);
  }

  let payload;
  try {
    payload = verifyAccountLinkToken(link);
  } catch {
    return NextResponse.redirect(`${appOrigin}/?vinculo_erro=link_invalido`);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.redirect(`${appOrigin}/login?next=${encodeURIComponent(pathname + search)}`);
  }

  const context = await loadCustomerContext(supabase, data.user.id);

  if (context.company?.id === payload.companyId) {
    // Já vinculado (reenvio do mesmo link, ou clicou 2x) — nada a fazer.
    return NextResponse.redirect(`${appOrigin}/frota/dashboard?vinculo=ja_feito`);
  }

  if (context.company) {
    // Usuário Google já é dono de outra empresa — nunca funde sem confirmação explícita.
    return NextResponse.redirect(`${appOrigin}/auth/account/confirm?link=${encodeURIComponent(link)}`);
  }

  const admin = createAdminClient();
  try {
    await linkUserToCompany(admin, payload.companyId, data.user.id, "owner", true);
  } catch (err) {
    if (!isUniqueViolation(err)) {
      return NextResponse.redirect(`${appOrigin}/?vinculo_erro=falha_vinculo`);
    }
    // Já era membro dessa empresa (só não era a padrão) — segue normalmente.
  }

  return NextResponse.redirect(`${appOrigin}/frota/dashboard?vinculo=1`);
}
