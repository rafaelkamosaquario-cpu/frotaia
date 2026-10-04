import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultancyCommand, isConsultant, sameOrigin } from "@/lib/frota/consultancy";

const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!isConsultant(user)) return reply({ error: "Acesso restrito à consultoria." }, 403);
  const result = await db.rpc("consultancy_admin", { p_action: "list" });
  if (result.error) return reply({ error: "Cadastro de consultoria indisponível. Verifique a implantação." }, 503);
  return reply({ companies: result.data });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Origem inválida." }, 403);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user || !isConsultant(user)) return reply({ error: "Acesso restrito à consultoria." }, 403);
  const parsed = consultancyCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Confira os campos. A senha temporária precisa de 12 caracteres, letras e números." }, 400);
  const command = parsed.data;
  if (command.action === "create") {
    const result = await db.rpc("consultancy_admin", { p_action: "create", p_payload: command });
    if (result.error) return reply({ error: result.error.code === "23505" ? "E-mail já cadastrado. Não substituímos senhas de contas existentes. Use o convite de acesso existente." : "Cadastro não confirmado. Tente novamente com os mesmos dados." }, result.error.code === "23505" ? 409 : 503);
    return reply(result.data);
  }
  const admin = createAdminClient();
  const { data: draft, error } = await admin.from("consultancy_onboardings")
    .select("company_id,client_email,contact_name,delivered_at")
    .eq("company_id", command.companyId).eq("consultant_id", user.id).maybeSingle();
  if (error) return reply({ error: "Entrega indisponível." }, 503);
  if (!draft) return reply({ error: "Empresa não autorizada." }, 403);
  if (draft.delivered_at) return reply({ error: "Acesso já entregue. Não será substituída a senha do cliente." }, 409);
  const recovery = await admin.rpc("consultancy_delivery_account", { p_company: draft.company_id, p_actor: user.id });
  if (recovery.error) return reply({ error: "Não foi possível conferir a entrega anterior. Tente novamente." }, 503);
  const created = recovery.data ? { data: { user: { id: recovery.data } }, error: null } : await admin.auth.admin.createUser({ email: draft.client_email, password: command.password,
    email_confirm: true, user_metadata: { full_name: draft.contact_name },
    app_metadata: { consultancy_company: draft.company_id } });
  if (created.error || !created.data.user) return reply({ error: "Não foi possível criar a conta. Se o e-mail já existe, preserve o acesso anterior e use convite. Nenhuma senha existente foi alterada." }, 409);
  const delivered = await admin.rpc("consultancy_deliver", { p_company: draft.company_id, p_actor: user.id, p_user: created.data.user.id });
  if (delivered.error) {
    // Do not delete Auth users on an ambiguous network failure: transaction may have committed.
    return reply({ error: "Conta criada, mas entrega não confirmada. Não compartilhe a senha ainda. Solicite reconciliação da entrega; não recrie a empresa." }, 503);
  }
  return reply({ ok: true, loginPath: "/acesso-cliente", email: draft.client_email, recovered: !!recovery.data });
}
