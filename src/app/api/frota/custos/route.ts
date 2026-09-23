import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { generateCost, listCosts, saveCostRule } from "@/services/supabase/costService";
import { monthSchema } from "@/lib/frota/costs";

async function access() {
  const result = await loadFleetPanelAccess(await createClient());
  if (!result.ok) return { response: Response.json({ error: "Sem acesso ao painel." }, { status: result.reason === "unauthenticated" ? 401 : 403 }) };
  if (!["owner", "admin", "operator"].includes(result.role)) return { response: Response.json({ error: "Sem permissão para custos e remunerações." }, { status: 403 }) };
  return { result };
}
function failure(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (["42P01", "PGRST205", "PGRST202"].includes(e.code ?? "")) return Response.json({ error: "Esta área aguarda a atualização do banco de dados. Nenhum lançamento foi salvo." }, { status: 503 });
  if (e.code === "23505") return Response.json({ error: "Este cadastro já existe ou este custo já foi gerado para o mês. Consulte o lançamento existente." }, { status: 409 });
  if (e.code === "PGRST116") return Response.json({ error: "Registro não encontrado ou indisponível para alteração." }, { status: 404 });
  if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  if (error instanceof SyntaxError) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  return Response.json({ error: error instanceof Error && !e.code ? error.message : "Não foi possível concluir. Nenhum pagamento foi realizado." }, { status: 400 });
}
export async function GET(request: Request) {
  const auth = await access(); if (auth.response) return auth.response;
  try {
    const month = monthSchema.parse(new URL(request.url).searchParams.get("month"));
    return Response.json(await listCosts(createAdminClient(), auth.result!.company.id, month));
  } catch (error) { return failure(error); }
}
const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("operation"), name: z.string().trim().min(2).max(80) }).strict(),
  z.object({ action: z.literal("rule"), id: z.uuid().optional(), definition: z.unknown() }).strict(),
  z.object({ action: z.literal("archive"), id: z.uuid(), active: z.boolean() }).strict(),
  z.object({ action: z.literal("generate"), input: z.unknown() }).strict(),
  z.object({ action: z.literal("confirm"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("paid"), id: z.uuid(), date: z.iso.date() }).strict(),
  z.object({ action: z.literal("discard"), id: z.uuid() }).strict(),
]);
export async function POST(request: Request) {
  const auth = await access(); if (auth.response) return auth.response;
  const companyId = auth.result!.company.id;
  try {
    const input = command.parse(await request.json()); const db = createAdminClient();
    if (input.action === "rule") return Response.json(await saveCostRule(db, companyId, input.definition, input.id));
    if (input.action === "generate") return Response.json(await generateCost(db, companyId, input.input));
    if (input.action === "operation") {
      const { data, error } = await db.from("cost_operations").insert({ company_id: companyId, name: input.name }).select("*").single();
      if (error) throw error; return Response.json(data);
    }
    if (input.action === "confirm") {
      const { data, error } = await db.rpc("confirm_cost_entry", { p_company: companyId, p_user: auth.result!.userId, p_entry: input.id });
      if (error) throw error; return Response.json({ expenseId: data });
    }
    if (input.action === "archive") {
      const { data, error } = await db.from("cost_rules").update({ active: input.active }).eq("id", input.id).eq("company_id", companyId).select("id").single();
      if (error) throw error; return Response.json(data);
    }
    if (input.action === "paid") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (input.date > today) throw new Error("Não marque como pago em uma data futura.");
      const { data, error } = await db.from("cost_entries").update({ paid_on: input.date }).eq("id", input.id).eq("company_id", companyId).not("expense_id", "is", null).is("paid_on", null).select("id").single();
      if (error) throw error; return Response.json(data);
    }
    // Only unconfirmed drafts can be discarded. Confirmed financial history is retained.
    const { data, error } = await db.from("cost_entries").delete().eq("id", input.id).eq("company_id", companyId).is("expense_id", null).select("id").single();
    if (error) throw error; return Response.json(data);
  } catch (error) { return failure(error); }
}
