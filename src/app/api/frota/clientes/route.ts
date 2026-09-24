import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadFleetPanelAccess } from "@/services/supabase/fleetPanelAccess";
import { freightCustomerSchema } from "@/lib/frota/freightCustomers";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const client = await createClient();
  const access = await loadFleetPanelAccess(client);
  if (!access.ok) return NextResponse.json({ error: "Sem acesso ao painel." }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  if (!["owner", "admin", "operator"].includes(access.role)) return NextResponse.json({ error: "Sem permissão para cadastrar clientes." }, { status: 403 });
  const parsed = freightCustomerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const { id, ...values } = parsed.data;
  // Session client + RLS, company derived from access, never from the request.
  const query = id
    ? client.from("freight_customers").update(values).eq("company_id", access.company.id).eq("id", id)
    : client.from("freight_customers").insert({ ...values, company_id: access.company.id });
  const { data, error } = await query.select("*").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Já existe um cliente com esse nome ou CNPJ nesta empresa." : "Não foi possível salvar o cliente. Confira seu acesso e tente novamente." }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ customer: data }, { status: id ? 200 : 201 });
}

