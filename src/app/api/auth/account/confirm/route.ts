import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAccountLinkToken } from "@/services/whatsapp/accountLinkToken";
import { linkUserToCompany } from "@/services/supabase/companyMemberService";
import { isUniqueViolation } from "@/lib/supabase/errors";

/** Confirma o vínculo da segunda empresa (ver src/app/auth/account/confirm/page.tsx) — re-verifica token e sessão, nunca confia só no que veio do form. */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const appOrigin = process.env.APP_URL ?? origin;

  const form = await request.formData();
  const link = form.get("link");

  if (typeof link !== "string" || !link) {
    return NextResponse.redirect(`${appOrigin}/?vinculo_erro=link_ausente`, { status: 303 });
  }

  let payload;
  try {
    payload = verifyAccountLinkToken(link);
  } catch {
    return NextResponse.redirect(`${appOrigin}/?vinculo_erro=link_invalido`, { status: 303 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return NextResponse.redirect(`${appOrigin}/login`, { status: 303 });
  }

  const admin = createAdminClient();
  try {
    await linkUserToCompany(admin, payload.companyId, data.user.id, "owner", false);
  } catch (err) {
    if (!isUniqueViolation(err)) {
      return NextResponse.redirect(`${appOrigin}/?vinculo_erro=falha_vinculo`, { status: 303 });
    }
  }

  return NextResponse.redirect(`${appOrigin}/frota/dashboard?vinculo=1`, { status: 303 });
}
