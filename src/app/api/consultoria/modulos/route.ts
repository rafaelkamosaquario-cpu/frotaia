import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsultant, sameOrigin } from "@/lib/frota/consultancy";
import { ALL_MODULE_IDS, TIMBER_MODULE_IDS, moduleCommand } from "@/lib/frota/companyModules";
import { isTimberNavigation } from "@/lib/frota/navigationProfile";
import { readCompanyModules } from "@/services/supabase/companyModulesService";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorized(companyId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!isConsultant(user) || !user) return null;
  const { data, error } = await db.from("company_members").select("company_id").eq("company_id", companyId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (error || !data) return null;
  const draft = await createAdminClient().from("consultancy_onboardings").select("consultant_until").eq("company_id", companyId).eq("consultant_id", user.id).maybeSingle();
  if (draft.error || (draft.data?.consultant_until && new Date(draft.data.consultant_until) <= new Date())) return null;
  return user;
}
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return reply({ error: "Empresa inválida." }, 400);
  if (!await authorized(companyId)) return reply({ error: "Empresa não autorizada ou acompanhamento encerrado." }, 403);
  try {
    const config = await readCompanyModules(companyId);
    return reply({ enabled: config?.enabled ?? (isTimberNavigation(companyId) ? TIMBER_MODULE_IDS : ALL_MODULE_IDS), revision: config?.revision ?? 0, configured: !!config });
  } catch { return reply({ error: "Configuração indisponível. Nenhuma alteração foi realizada." }, 503); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Origem inválida." }, 403);
  const parsed = moduleCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Confira a empresa e os módulos selecionados." }, 400);
  const { companyId, enabled, revision } = parsed.data;
  const user = await authorized(companyId);
  if (!user) return reply({ error: "Empresa não autorizada ou acompanhamento encerrado." }, 403);
  const db = createAdminClient();
  const payload = { company_id: companyId, enabled, revision: revision + 1, updated_by: user.id, updated_at: new Date().toISOString() };
  const result = revision === 0 ? await db.from("company_panel_modules").insert(payload).select("revision").single()
    : await db.from("company_panel_modules").update(payload).eq("company_id", companyId).eq("revision", revision).select("revision").maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data)) return reply({ error: "A configuração mudou em outra janela. Recarregue antes de salvar." }, 409);
  if (result.error) return reply({ error: "Não foi possível salvar. Recarregue para conferir o estado atual." }, 503);
  return reply({ ok: true, revision: result.data!.revision });
}
