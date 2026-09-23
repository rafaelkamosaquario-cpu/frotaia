import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { fuelStockCommand } from "@/lib/frota/fuelStock";

async function authorize() {
  const client = await createClient();
  const access = await loadFleetPanelAccess(client);
  if (!access.ok || !["owner", "admin", "operator"].includes(access.role)) return null;
  return { client, access };
}
export async function GET() {
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (process.env.FUEL_INTERNAL_ENABLED !== "true") return NextResponse.json({ error: "Estoque interno ainda não liberado." }, { status: 503 });
  const { client, access } = auth;
  const [balance, history] = await Promise.all([
    client.from("fuel_stock_balances").select("*").eq("company_id", access.company.id).maybeSingle(),
    client.from("fuel_stock_movements").select("*").eq("company_id", access.company.id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (balance.error || history.error) return NextResponse.json({ error: "Não foi possível consultar o estoque." }, { status: 500 });
  return NextResponse.json({ balance: balance.data ?? { liters: 0, value: 0, last_date: null }, history: history.data });
}
export async function POST(request: Request) {
  const auth = await authorize();
  if (!auth) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  if (process.env.FUEL_INTERNAL_ENABLED !== "true") return NextResponse.json({ error: "Estoque interno ainda não liberado." }, { status: 503 });
  const input = fuelStockCommand.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Confira os campos obrigatórios, valores e data." }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("record_fuel_stock", { p_company: auth.access.company.id, p_user: auth.access.userId, p_command: input.data });
  if (error) {
    // PostgreSQL business exceptions are safe; never expose generic database details.
    const message = error.code === "P0001" ? error.message : error.code === "23505" ? "Essa nota já foi registrada para o fornecedor." : "Não foi possível registrar. Atualize o estoque e tente novamente.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json({ movement: data }, { status: 201 });
}
