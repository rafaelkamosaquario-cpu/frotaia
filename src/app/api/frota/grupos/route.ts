import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { sameOrigin } from "@/lib/frota/consultancy";
import { operationalGroupCommand } from "@/lib/frota/operationalGroups";

const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok) return reply({ error: "Entre com uma conta autorizada." }, access.reason === "unauthenticated" ? 401 : 403);
  if (!["owner", "admin"].includes(access.role)) return reply({ error: "Cadastro restrito ao proprietário e administrador." }, 403);
  const result = await db.rpc("manage_operational_groups", { p_company: access.company.id, p_action: "list" });
  if (result.error) return reply({ error: "Não foi possível carregar os grupos. Confira a implantação e tente novamente." }, 503);
  return reply({ groups: result.data });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Origem inválida." }, 403);
  const db = await createClient(), access = await loadFleetPanelAccess(db);
  if (!access.ok) return reply({ error: "Entre com uma conta autorizada." }, access.reason === "unauthenticated" ? 401 : 403);
  if (!["owner", "admin"].includes(access.role)) return reply({ error: "Cadastro restrito ao proprietário e administrador." }, 403);
  const command = operationalGroupCommand.safeParse(await request.json().catch(() => null));
  if (!command.success) return reply({ error: "Confira nome, finalidade e observações do grupo." }, 400);
  const result = await db.rpc("manage_operational_groups", { p_company: access.company.id, p_action: command.data.action, p_payload: command.data });
  if (result.error) return reply({ error: result.error.code === "23505" ? "Já existe um grupo com esse nome nesta empresa. Edite o cadastro existente." : "Não foi possível salvar o grupo. Nenhuma ativação foi realizada." }, result.error.code === "23505" ? 409 : result.error.code === "42501" ? 403 : 503);
  return reply({ ok: true });
}
