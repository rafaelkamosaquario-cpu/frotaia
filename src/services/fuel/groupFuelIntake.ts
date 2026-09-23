import "server-only";
import { z } from "zod";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { emptyFuelEvidence, fuelEvidenceSchema } from "@/lib/frota/fuelGroup";
import { fuelStockCommand } from "@/lib/frota/fuelStock";
import { fuelLocalDate } from "@/lib/frota/fuelConversation";
import { acceptTruckReadings, applyTruckEvidence, newTruckFlow, truckAction, truckField, truckFlowSchema, truckLabel, truckPrompt, truckRequest, truckVehicle, typedTruckEvidence, type TruckFlow } from "@/lib/frota/fuelTruckFlow";
import { extractFuelEvidence } from "./fuelImageExtraction";
import { sendWhatsappGroupButtons, sendWhatsappGroupText } from "@/lib/whatsapp/zapiClient";
import { normalizePhoneDigits } from "@/lib/identity/phoneNormalizer";

const bindingsSchema = z.array(z.object({ groupId: z.string().regex(/^\d+-group$/), companyId: z.uuid(), operatorId: z.uuid(), senders: z.array(z.string().regex(/^\d{12,13}$/)).min(1), dryRun: z.boolean().default(true) }).strict());
export interface GroupFuelInput {
  phone?: string; participantPhone?: string; messageId?: string; text?: { message?: string };
  image?: { imageUrl?: string; mimeType?: string; caption?: string };
  buttonsResponseMessage?: { buttonId?: string; message?: string };
}

/** Configured groups are always consumed; never leak into another workflow. */
export async function processGroupFuel(client: SupabaseDbClient, input: GroupFuelInput): Promise<boolean> {
  if (process.env.FUEL_GROUP_ENABLED !== "true") return false;
  const configs = bindingsSchema.parse(JSON.parse(process.env.FUEL_GROUP_BINDINGS ?? "[]"));
  if (new Set(configs.map(c => c.groupId)).size !== configs.length) throw new Error("Grupo configurado mais de uma vez.");
  const config = configs.find(c => c.groupId === input.phone);
  if (!config) return false;
  const sender = normalizePhoneDigits(input.participantPhone ?? "");
  const button = input.buttonsResponseMessage?.buttonId;
  if (!config.senders.includes(sender) || !input.messageId || (!input.text?.message && !input.image?.imageUrl && !button)) return true;
  const member = await client.from("company_members").select("role").eq("company_id", config.companyId).eq("user_id", config.operatorId).eq("status", "active").maybeSingle();
  if (member.error) throw member.error;
  if (!member.data || !["owner", "admin", "operator"].includes(member.data.role)) return true;
  const [vs, ds, current] = await Promise.all([
    client.from("vehicles").select("id,name,plate").eq("company_id", config.companyId).limit(100),
    client.from("drivers").select("id,name").eq("company_id", config.companyId).limit(100),
    client.from("fuel_group_drafts").select("*").eq("company_id", config.companyId).eq("group_id", config.groupId).eq("sender", sender).maybeSingle(),
  ]);
  if (vs.error || ds.error || current.error) throw vs.error ?? ds.error ?? current.error;
  const vehicles = (vs.data ?? []).map(v => ({ ...v, name: v.name ?? v.plate ?? v.id }));
  const drivers = (ds.data ?? []).map(d => ({ ...d, name: d.name ?? d.id })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
  const text = (input.text?.message ?? input.image?.caption ?? "").trim();
  const prefix = config.dryRun ? "[TESTE — não grava estoque/despesa]\n" : "";
  const reply = (message: string) => sendWhatsappGroupText(config.groupId, prefix + message);
  const args = { p_company: config.companyId, p_user: config.operatorId, p_group: config.groupId, p_sender: sender, p_message: input.messageId, p_dry_run: config.dryRun };
  const draft = current.data;
  const fresh = draft && Date.parse(draft.updated_at) >= Date.now() - 2 * 60 * 60 * 1000;
  const saved = truckFlowSchema.safeParse(fresh ? (draft.evidence as Record<string, unknown>).truckFlow : undefined);
  let state = acceptTruckReadings(saved.success ? saved.data : newTruckFlow(), vehicles);
  const field = truckField(state);
  const token = button ?? (text.startsWith("fuel:") ? text : null);
  const namedDrivers = !field && !token ? drivers.filter(d => d.name.trim().toLocaleLowerCase("pt-BR") === text.replace(/^MOTORISTA\s+/i, "").trim().toLocaleLowerCase("pt-BR")) : [];
  const action = token && fresh && saved.success ? truckAction(token, draft.draft_id, draft.revision) : namedDrivers.length === 1 ? `driver:${namedDrivers[0].id}` : null;
  const emit = async (s: TruckFlow, id: string, revision: number, notice = "") => {
    const prompt = truckPrompt(s, vehicles, drivers, id, revision);
    if (!prompt.buttons.length) { await reply(notice + prompt.message); return; }
    // Text is independently delivered: a provider accepting buttons does not prove
    // they render in the group. A typed, unique company driver name remains usable.
    await reply(notice + "Identifique-se como condutor. Toque no seu nome nas opções ou digite seu nome completo cadastrado.");
    try { await sendWhatsappGroupButtons(config.groupId, prefix + prompt.message, prompt.buttons); }
    catch {
      console.warn("[fuel-group] button_send_failed");
      await reply("Não consegui enviar os botões. Digite seu nome completo cadastrado para se identificar. Nenhum abastecimento foi registrado.");
    }
  };
  if (token && !action) { await reply("Este botão é antigo ou pertence a outro abastecimento. Envie RESUMO para receber seus botões atuais."); return true; }
  if (action?.startsWith("driver:")) {
    const driver = drivers.find(d => d.id === action.slice(7));
    const vehicle = truckVehicle(state.plate, vehicles);
    const offered = truckPrompt(state, vehicles, drivers, draft!.draft_id, draft!.revision).buttons.some(b => b.id === token);
    if (field || !driver || !vehicle || (token && !offered)) { await reply("Identificação inválida. Envie RESUMO para continuar."); return true; }
    if (!config.dryRun && process.env.FUEL_INTERNAL_ENABLED !== "true") { await reply("Registro interno ainda não liberado. Nenhuma baixa realizada."); return true; }
    const command = fuelStockCommand.parse({ kind: "withdrawal", requestId: draft!.draft_id, date: fuelLocalDate(new Date(state.startedAt)), liters: state.liters, vehicleId: vehicle.id, driverId: driver.id, meter: state.meter, meterKind: "km" });
    const result = await client.rpc("fuel_group_step", { ...args, p_action: "confirm", p_patch: {}, p_revision: draft!.revision, p_draft: draft!.draft_id, p_command: command });
    if (result.error) { await reply("Não foi possível concluir. Confira o estoque no painel e envie RESUMO para tentar novamente. Nenhuma confirmação de registro foi emitida."); return true; }
    if ((result.data as { duplicate?: boolean })?.duplicate) return true;
    const when = new Date(state.startedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await reply(`✅ Litragem confirmada\n✅ Odômetro confirmado\n✅ Placa confirmada\n✅ Condutor identificado\n\nPlaca: ${vehicle.plate}\nOdômetro: ${state.meter!.toLocaleString("pt-BR")} km\nLitros: ${state.liters!.toLocaleString("pt-BR")}\nCondutor: ${driver.name}\nData e hora do abastecimento: ${when}\n${config.dryRun ? "✅ Simulação concluída — nenhum lançamento realizado." : "✅ Abastecimento registrado. Estoque e custo vinculados no painel."}`);
    return true;
  }
  const reset = /^(NOVO|CANCELAR)$/i.test(text);
  const summary = /^(RESUMO|TESTE ABASTECIMENTO)$/i.test(text);
  let notice = "";
  if (reset) state = newTruckFlow();
  else if (action === "more" && !field) state.page = (state.page + 1) % Math.max(1, Math.ceil(drivers.length / 2));
  else if (action) { await reply("Esta opção não corresponde à etapa atual. Envie RESUMO."); return true; }
  else if (!summary) {
    if (!field) { await reply("Não identifiquei um único condutor com esse nome. Digite seu nome completo cadastrado ou envie RESUMO para ver as opções."); return true; }
    try {
      const typed = !input.image?.imageUrl ? typedTruckEvidence(text, field) : null;
      const explicit = typed
        ? fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...typed })
        : await extractFuelEvidence(text, input.image);
      const before = state;
      state = acceptTruckReadings(applyTruckEvidence(state, explicit), vehicles);
      notice = (["liters", "meter", "plate"] as const).filter(f => !before.confirmed[f] && state.confirmed[f]).map(f => `✅ ${truckLabel(f)} confirmad${f === "meter" ? "o" : "a"}: ${typeof state[f] === "number" ? state[f].toLocaleString("pt-BR") : state[f]}${f === "liters" ? " litros" : f === "meter" ? " km" : ""}.\n`).join("");
      if (!notice && input.image?.imageUrl && !state.confirmed[field]) notice = "Não consegui identificar esse dado com segurança. ";
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
      console.warn("[fuel-group] extraction_failed", { status, image: Boolean(input.image?.imageUrl) });
      await reply(status !== null ? "O serviço de leitura está indisponível. Seus dados anteriores foram mantidos. Tente novamente mais tarde." : `Não consegui ler com segurança. ${field ? truckRequest(field) : "Envie RESUMO para continuar."}`);
      return true;
    }
  }
  const result = await client.rpc("fuel_group_step", { ...args, p_action: reset ? "reset" : "merge", p_patch: { truckFlow: state }, p_revision: draft?.revision ?? 0, p_draft: draft?.draft_id });
  if (result.error) { await reply("Outra mensagem atualizou este abastecimento. Envie RESUMO e repita somente o último dado se faltar."); return true; }
  if ((result.data as { duplicate?: boolean })?.duplicate) return true;
  const updated = result.data as { evidence: { truckFlow: unknown }; draft_id: string; revision: number };
  await emit(truckFlowSchema.parse(updated.evidence.truckFlow), updated.draft_id, updated.revision, notice);
  return true;
}

