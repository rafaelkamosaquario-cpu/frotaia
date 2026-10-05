import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { brazilToday, productionSchema } from "@/lib/frota/productionGoals";
import { monthSchema } from "@/lib/frota/costs";
import { listRevenues } from "@/services/supabase/revenueService";
import { productionMonthRange, summarizeProductionRevenue } from "@/lib/frota/productionRevenue";

const fail = (error: string, status: number) => Response.json({ error }, { status });
export async function GET(request: Request) {
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok) return fail("Sem acesso ao painel.", access.reason === "unauthenticated" ? 401 : 403);
  const today = brazilToday();
  let month = new URL(request.url).searchParams.get("month");
  if (!month) {
    const latest = await db.from("fleet_monthly_production").select("month").eq("company_id", access.company.id).not("actual_tonnes", "is", null).lte("month", today.slice(0, 7)).order("month", { ascending: false }).limit(1);
    if (latest.error) return fail("Não foi possível carregar as metas. Tente novamente.", 503);
    month = latest.data?.[0]?.month ?? today.slice(0, 7);
  }
  if (!monthSchema.safeParse(month).success) return fail("Mês inválido.", 400);
  const { data, error } = await db.from("fleet_monthly_production").select("*").eq("company_id", access.company.id).eq("month", month).order("vehicle_id");
  if (error) return fail("Não foi possível carregar as metas. Tente novamente.", 503);
  let revenueSummary = null;
  let revenueError: string | null = null;
  try {
    const revenues = await listRevenues(db, { companyId: access.company.id, ...productionMonthRange(month), all: true });
    revenueSummary = summarizeProductionRevenue(data ?? [], revenues);
  } catch {
    revenueError = "Não foi possível carregar as receitas deste mês. Os valores não estão sendo exibidos como zero. Tente atualizar.";
  }
  return Response.json({ month, today, rows: data, revenueSummary, revenueError, canEdit: ["owner", "admin", "operator"].includes(access.role) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (origin) {
    try { if (new URL(origin).host !== host || !["https:", "http:"].includes(new URL(origin).protocol)) return fail("Origem inválida.", 403); }
    catch { return fail("Origem inválida.", 403); }
  }
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok) return fail("Sem acesso ao painel.", access.reason === "unauthenticated" ? 401 : 403);
  if (!["owner", "admin", "operator"].includes(access.role)) return fail("Sem permissão para editar metas.", 403);
  const parsed = productionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.", 400);
  const { revision, ...values } = parsed.data;
  if (values.measured_through && values.measured_through > brazilToday()) return fail("Não informe produção apurada em data futura.", 400);
  // Session client, composite FK and RLS protect against cross-company writes.
  const query = revision === null
    ? db.from("fleet_monthly_production").insert({ ...values, company_id: access.company.id })
    : db.from("fleet_monthly_production").update(values).eq("company_id", access.company.id).eq("vehicle_id", values.vehicle_id).eq("month", values.month).eq("revision", revision);
  const { data, error } = await query.select("*").single();
  if (error) return fail(["23505", "PGRST116"].includes(error.code) ? "Os dados foram alterados em outra sessão. Recarregue o mês antes de salvar." : "Não foi possível salvar. Confira o veículo e seu acesso.", ["23505", "PGRST116"].includes(error.code) ? 409 : 400);
  return Response.json({ row: data }, { status: revision === null ? 201 : 200 });
}
