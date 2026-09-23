import "server-only";
import { z } from "zod";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { fuelEvidenceSchema, emptyFuelEvidence, reviewFuelEvidence, type FuelGroupDraft } from "@/lib/frota/fuelGroup";
import { fuelStockCommand } from "@/lib/frota/fuelStock";
import { extractFuelEvidence } from "./fuelImageExtraction";
import { sendWhatsappGroupText } from "@/lib/whatsapp/zapiClient";
import { normalizePhoneDigits } from "@/lib/identity/phoneNormalizer";
import { fuelConversation, fuelLocalDate, selectedFuelDriver } from "@/lib/frota/fuelConversation";

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
  const current = await client.from("fuel_group_drafts").select("*").eq("company_id", config.companyId).eq("group_id", config.groupId).eq("sender", sender).maybeSingle();
  if (current.error) throw current.error;
  const fresh = current.data && Date.parse(current.data.updated_at) >= Date.now() - 2 * 60 * 60 * 1000;
  const previous = fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...(fresh ? current.data!.evidence : {}) });
  const selected = !input.image?.imageUrl ? selectedFuelDriver(text, previous, vehicles, drivers) : null;
  if (/^CONFIRMAR\s+/i.test(text) || selected) {
    const draft = fresh ? current.data : null;
    if (!draft || (!selected && text.toUpperCase() !== `CONFIRMAR ${draft.draft_id.slice(0, 8)}-${draft.revision}`.toUpperCase())) { await reply("Código de confirmação inválido ou antigo. Envie RESUMO para conferir os dados atuais."); return true; }
    const evidence = fuelEvidenceSchema.parse({ ...previous, ...(selected ? { driver: selected.name } : {}) });
    const review = reviewFuelEvidence(evidence, vehicles, drivers, `${draft.draft_id.slice(0, 8)}-${draft.revision}`);
    if (!review.ready) { await reply(review.message); return true; }
    const command = fuelStockCommand.parse({ kind: "withdrawal", requestId: draft.draft_id, date: evidence.date, liters: evidence.liters, vehicleId: review.vehicleId, driverId: review.driverId, meter: evidence.meter, meterKind: evidence.meterKind });
    if (!config.dryRun && process.env.FUEL_INTERNAL_ENABLED !== "true") { await reply("Registro interno ainda não liberado. Nenhuma baixa realizada."); return true; }
    const result = await client.rpc("fuel_group_step", { ...args, p_action: "confirm", p_patch: {}, p_revision: draft.revision, p_draft: draft.draft_id, p_command: command });
    if (result.error) { await reply("Não foi possível confirmar. O estoque pode estar insuficiente ou os dados mudaram. Confira no painel e envie RESUMO. Nenhuma confirmação de gravação foi emitida."); return true; }
    if ((result.data as { duplicate?: boolean })?.duplicate) return true;
    const completed = `Placa/equipamento: ${vehicles.find(v => v.id === review.vehicleId)?.plate ?? evidence.vehicle}\nQuilometragem/horímetro: ${evidence.meter} ${evidence.meterKind === "km" ? "km" : "horas"}\nLitros: ${evidence.liters}\nMotorista: ${evidence.driver}\nData: ${evidence.date}\nHora do registro: ${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    await reply(`${completed}\n${config.dryRun ? "Simulação confirmada. Nenhum abastecimento, despesa ou baixa de estoque foi criado." : "Abastecimento interno registrado e estoque atualizado. Dados financeiros disponíveis somente no painel."}`);
    return true;
  }
  const reset = /^(NOVO|CANCELAR)$/i.test(text);
  const summary = /^(RESUMO|TESTE ABASTECIMENTO)$/i.test(text);
  let evidence = emptyFuelEvidence;
  if (!reset && !summary) {
    try { evidence = await extractFuelEvidence(text, input.image); }
    catch (error) {
      // Never log provider messages, image URLs, credentials or customer content.
      const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
      const category = error instanceof SyntaxError ? "invalid_json" : error instanceof z.ZodError ? "invalid_evidence" : status !== null ? "provider_error" : "extraction_error";
      console.warn("[fuel-group] extraction_failed", { category, status, image: Boolean(input.image?.imageUrl) });
      await reply(status !== null
        ? "O serviço de leitura está indisponível neste momento. Não registrei este envio. Tente novamente mais tarde; não informe preços no grupo."
        : `Não consegui identificar os dados desta imagem/mensagem com segurança. Os dados anteriores foram mantidos.\n${fuelConversation(previous, vehicles, drivers)}`);
      return true;
    }
  }
  // Driver names extracted from photos do not conclude or preselect a driver.
  // Date defaults to the first message of this draft in the company's operating timezone.
  const patch = reset ? {} : { ...evidence, driver: null, date: evidence.date ?? previous.date ?? fuelLocalDate() };
  const result = await client.rpc("fuel_group_step", { ...args, p_action: reset ? "reset" : "merge", p_patch: patch });
  if (result.error) throw result.error;
  if ((result.data as { duplicate?: boolean })?.duplicate) return true;
  const draft = result.data as unknown as FuelGroupDraft;
  if (reset) { await reply("Conferência anterior descartada. Envie os dados do novo abastecimento; nenhuma baixa foi feita."); return true; }
  await reply(fuelConversation(fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...draft.evidence }), vehicles, drivers));
  return true;
}
