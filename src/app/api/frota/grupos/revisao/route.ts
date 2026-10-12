import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { sameOrigin } from "@/lib/frota/consultancy";
import { modulePathAllowed } from "@/lib/frota/companyModules";
import { groupReviewCommand, type ReviewRecord } from "@/lib/frota/groupReview";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function authorized() {
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok || !["owner", "admin"].includes(access.role)) return null;
  if (!access.moduleBypass && !modulePathAllowed(access.moduleConfig?.enabled ?? null, "/frota/abastecimentos")) return null;
  return access;
}
export async function GET() {
  const access = await authorized();
  if (!access) return reply({ error: "Conferência exige acesso administrativo e financeiro da empresa." }, 403);
  const db = createAdminClient(), company = access.company.id;
  const [fuel, revenues, vehicles] = await Promise.all([
    db.from("fuel_fillups").select("id,vehicle_id,fillup_date,liters,total_amount").eq("company_id", company).order("fillup_date", { ascending: false }).limit(100),
    db.from("revenues").select("id,vehicle_id,revenue_date,amount,description").eq("company_id", company).order("revenue_date", { ascending: false }).limit(100),
    db.from("vehicles").select("id,plate,name").eq("company_id", company),
  ]);
  if (fuel.error || revenues.error || vehicles.error) return reply({ error: "Não foi possível consultar os lançamentos." }, 503);
  const names = new Map(vehicles.data.map(v => [v.id, v.plate || v.name || "Veículo"]));
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const records: ReviewRecord[] = [
    ...fuel.data.filter(r => names.has(r.vehicle_id)).map(r => ({ id: r.id, type: "fuel" as const, vehicleId: r.vehicle_id, label: `${names.get(r.vehicle_id)} · ${r.fillup_date} · ${r.liters} L · ${money(Number(r.total_amount))}` })),
    ...revenues.data.filter(r => r.vehicle_id && names.has(r.vehicle_id)).map(r => ({ id: r.id, type: "revenue" as const, vehicleId: r.vehicle_id, label: `${names.get(r.vehicle_id!)} · ${r.revenue_date} · ${money(Number(r.amount))} · ${(r.description ?? "Receita").slice(0, 100)}` })),
  ];
  return reply({ records });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Origem inválida." }, 403);
  const command = groupReviewCommand.safeParse(await request.json().catch(() => null));
  if (!command.success) return reply({ error: "Confira o lançamento e informe uma observação da revisão." }, 400);
  const access = await authorized();
  if (!access) return reply({ error: "Conferência não autorizada." }, 403);
  const c = command.data;
  const result = await createAdminClient().rpc("link_group_observation", { p_company: access.company.id, p_actor: access.userId, p_observation: c.observationId, p_type: c.recordType, p_record: c.recordId, p_note: c.note });
  if (result.error) return reply({ error: "Não foi possível vincular. Confira se o lançamento pertence à empresa e se já foi vinculado a outra mensagem. Se necessário, atualize a tela." }, 409);
  return reply({ ok: true });
}
