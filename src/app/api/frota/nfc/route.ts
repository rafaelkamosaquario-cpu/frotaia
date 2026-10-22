import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/frota/consultancy";
import { nfcCommand, tagCanTransition } from "@/lib/frota/nfc";
import { nfcAccess } from "@/services/supabase/nfcAccess";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private, no-store"}});
export async function GET() {
  const a = await nfcAccess();
  if (!a) return reply({error: "Configuração exclusiva do ADM autorizado nesta empresa."}, 403);
  const {data, error} = await createAdminClient().from("fleet_nfc_tags").select("*").eq("company_id", a.company.id).order("created_at", {ascending: false});
  if (error) return reply({error: "Cadastro NFC ainda não ativado no banco. Nenhum cartão foi criado."}, 503);
  return reply({tags: data, companyId: a.company.id, companyName: a.company.name});
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({error: "Origem inválida."}, 403);
  const a = await nfcAccess();
  if (!a) return reply({error: "Sem autorização para configurar cartões nesta empresa."}, 403);
  const raw = await req.text();
  if (raw.length > 4000) return reply({error: "Solicitação muito grande."}, 413);
  let b;
  try { b = nfcCommand.parse(JSON.parse(raw)); } catch { return reply({error: "Confira os dados do cartão."}, 400); }
  if (b.companyId !== a.company.id) return reply({error: "A empresa selecionada mudou. Reabra o cadastro."}, 409);
  const db = createAdminClient();
  if (b.action === "create") {
    if (b.vehicleId) {
      const v = await db.from("vehicles").select("id").eq("id", b.vehicleId).eq("company_id", a.company.id).eq("active", true).maybeSingle();
      if (v.error) return reply({error: "Não foi possível conferir o veículo."}, 503);
      if (!v.data) return reply({error: "Veículo ativo não encontrado nesta empresa."}, 404);
    }
    const {data, error} = await db.from("fleet_nfc_tags").insert({company_id: a.company.id, vehicle_id: b.vehicleId,
      kind: b.kind, label: b.label, physical_code: b.physicalCode, token: randomBytes(24).toString("hex"), created_by: a.userId}).select().single();
    if (error) return reply({error: error.code === "23505" ? "Já existe cartão vigente para este veículo ou código físico. Atualize a lista." : "Não foi possível salvar o cartão."}, error.code === "23505" ? 409 : 503);
    return reply({tag: data}, 201);
  }
  const old = await db.from("fleet_nfc_tags").select("*").eq("id", b.id).eq("company_id", a.company.id).maybeSingle();
  if (old.error) return reply({error: "Consulta indisponível."}, 503);
  if (!old.data) return reply({error: "Cartão não encontrado."}, 404);
  if (old.data.version !== b.version || !tagCanTransition(old.data.status, b.action)) return reply({error: "Cartão alterado ou desativado. Atualize a lista."}, 409);
  const {data, error} = await db.from("fleet_nfc_tags").update({status: b.action === "revoke" ? "revoked" : "tested",
    version: b.version + 1, updated_at: new Date().toISOString()}).eq("id", b.id).eq("company_id", a.company.id).eq("version", b.version).select().maybeSingle();
  if (error || !data) return reply({error: "Não foi possível confirmar a alteração. Atualize a lista."}, error ? 503 : 409);
  return reply({tag: data});
}
