import "server-only";
import { z } from "zod";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { fuelEvidenceSchema, emptyFuelEvidence, reviewFuelEvidence, type FuelGroupDraft } from "@/lib/frota/fuelGroup";
import { fuelStockCommand } from "@/lib/frota/fuelStock";
import { extractFuelEvidence } from "./fuelImageExtraction";
import { sendWhatsappGroupText } from "@/lib/whatsapp/zapiClient";
import { normalizePhoneDigits } from "@/lib/identity/phoneNormalizer";

const bindingsSchema = z.array(z.object({ groupId: z.string().regex(/^\d+-group$/), companyId: z.uuid(), operatorId: z.uuid(), senders: z.array(z.string().regex(/^\d{12,13}$/)).min(1), dryRun: z.boolean().default(true) }).strict());
export interface GroupFuelInput { phone?: string; participantPhone?: string; messageId?: string; text?: { message?: string }; image?: { imageUrl?: string; mimeType?: string; caption?: string } }

/** Returns true for configured fuel groups, even for unauthorized participants: never falls into radar. */
export async function processGroupFuel(client: SupabaseDbClient, input: GroupFuelInput): Promise<boolean> {
  if (process.env.FUEL_GROUP_ENABLED !== "true") return false;
  const configs = bindingsSchema.parse(JSON.parse(process.env.FUEL_GROUP_BINDINGS ?? "[]"));
  if (new Set(configs.map(c => c.groupId)).size !== configs.length) throw new Error("Grupo configurado mais de uma vez.");
  const config = configs.find(c => c.groupId === input.phone);
  if (!config) return false;
  const sender = normalizePhoneDigits(input.participantPhone ?? "");
  if (!config.senders.includes(sender) || !input.messageId || (!input.text?.message && !input.image?.imageUrl)) return true;
  // Recheck delegated operator membership before listing any company choices or sending them to group.
  const member = await client.from("company_members").select("role").eq("company_id", config.companyId).eq("user_id", config.operatorId).eq("status", "active").maybeSingle();
  if (member.error) throw member.error;
  if (!member.data || !["owner", "admin", "operator"].includes(member.data.role)) return true;
  const [vs, ds] = await Promise.all([
    client.from("vehicles").select("id,name,plate").eq("company_id", config.companyId).limit(100),
    client.from("drivers").select("id,name").eq("company_id", config.companyId).limit(100),
  ]);
  if (vs.error || ds.error) throw vs.error ?? ds.error;
  const vehicles = (vs.data ?? []).map(v => ({ ...v, name: v.name ?? v.plate ?? v.id }));
  const drivers = (ds.data ?? []).map(d => ({ ...d, name: d.name ?? d.id }));
  const text = (input.text?.message ?? input.image?.caption ?? "").trim();
  const args = { p_company: config.companyId, p_user: config.operatorId, p_group: config.groupId, p_sender: sender, p_message: input.messageId, p_dry_run: config.dryRun };
  const reply = (message: string) => sendWhatsappGroupText(config.groupId, `${config.dryRun ? "[TESTE — não grava estoque/despesa]\n" : ""}${message}`);
  if (/^CONFIRMAR\s+/i.test(text)) {
    const current = await client.from("fuel_group_drafts").select("*").eq("company_id", config.companyId).eq("group_id", config.groupId).eq("sender", sender).maybeSingle();
    if (current.error) throw current.error;
    const draft = current.data;
    if (!draft || text.toUpperCase() !== `CONFIRMAR ${draft.draft_id.slice(0, 8)}-${draft.revision}`.toUpperCase()) { await reply("Código de confirmação inválido ou antigo. Envie RESUMO para conferir os dados atuais."); return true; }
    const evidence = fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...draft.evidence });
    const review = reviewFuelEvidence(evidence, vehicles, drivers, `${draft.draft_id.slice(0, 8)}-${draft.revision}`);
    if (!review.ready) { await reply(review.message); return true; }
    const command = fuelStockCommand.parse({ kind: "withdrawal", requestId: draft.draft_id, date: evidence.date, liters: evidence.liters, vehicleId: review.vehicleId, driverId: review.driverId, meter: evidence.meter, meterKind: evidence.meterKind });
    if (!config.dryRun && process.env.FUEL_INTERNAL_ENABLED !== "true") { await reply("Registro interno ainda não liberado. Nenhuma baixa realizada."); return true; }
    const result = await client.rpc("fuel_group_step", { ...args, p_action: "confirm", p_patch: {}, p_revision: draft.revision, p_draft: draft.draft_id, p_command: command });
    if (result.error) { await reply("Não foi possível confirmar. O estoque pode estar insuficiente ou os dados mudaram. Confira no painel e envie RESUMO. Nenhuma confirmação de gravação foi emitida."); return true; }
    if ((result.data as { duplicate?: boolean })?.duplicate) return true;
    await reply(config.dryRun ? "Simulação confirmada. Nenhum abastecimento, despesa ou baixa de estoque foi criado." : "Abastecimento interno registrado e estoque atualizado. Dados financeiros disponíveis somente no painel.");
    return true;
  }
  const reset = /^(NOVO|CANCELAR)$/i.test(text);
  const summary = /^(RESUMO|TESTE ABASTECIMENTO)$/i.test(text);
  let evidence = emptyFuelEvidence;
  if (!reset && !summary) {
    try { evidence = await extractFuelEvidence(text, input.image); }
    catch { await reply("Não consegui identificar os dados com segurança. Informe placa/equipamento, quilometragem total ou horímetro, litros, condutor e data por texto. Não informe preços no grupo."); return true; }
  }
  const result = await client.rpc("fuel_group_step", { ...args, p_action: reset ? "reset" : "merge", p_patch: evidence });
  if (result.error) throw result.error;
  if ((result.data as { duplicate?: boolean })?.duplicate) return true;
  const draft = result.data as unknown as FuelGroupDraft;
  if (reset) { await reply("Conferência anterior descartada. Envie os dados do novo abastecimento; nenhuma baixa foi feita."); return true; }
  const review = reviewFuelEvidence(fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...draft.evidence }), vehicles, drivers, `${draft.draft_id.slice(0, 8)}-${draft.revision}`);
  await reply(review.message);
  return true;
}
