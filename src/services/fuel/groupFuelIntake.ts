import "server-only";
import { z } from "zod";
import type { SupabaseDbClient } from "@/services/supabase/types";
import { emptyFuelEvidence, fuelEvidenceSchema, resolveFuelChoice } from "@/lib/frota/fuelGroup";
import { fuelStockCommand } from "@/lib/frota/fuelStock";
import { fuelLocalDate } from "@/lib/frota/fuelConversation";
import { acceptTruckReadings, applyTruckEvidence, equipmentChoices, flowVehicle, newTruckFlow, truckAction, truckField, truckFlowSchema, truckLabel, truckPrompt, truckRequest, typedTruckEvidence, type TruckFlow } from "@/lib/frota/fuelTruckFlow";
import { extractFuelEvidence } from "./fuelImageExtraction";
import { sendWhatsappGroupButtons, sendWhatsappGroupText } from "@/lib/whatsapp/zapiClient";
import { normalizePhoneDigits } from "@/lib/identity/phoneNormalizer";

const bindingsSchema = z.array(z.object({ groupId: z.string().regex(/^\d+-group$/), companyId: z.uuid(), operatorId: z.uuid(), senders: z.array(z.string().regex(/^\d{12,13}$/)).min(1), dryRun: z.boolean().default(true), driverIds: z.array(z.uuid()).optional() }).strict());
export interface GroupFuelInput {
  phone?: string; participantPhone?: string; messageId?: string; text?: { message?: string };
  image?: { imageUrl?: string; mimeType?: string; caption?: string };
  buttonsResponseMessage?: { buttonId?: string; message?: string };
  listResponseMessage?: { selectedRowId?: string; title?: string; message?: string };
  buttonReply?: unknown;
}

// The live provider sends buttonReply (not buttonsResponseMessage).
// Accept only our own revision-bound token from its immediate string fields;
// never interpret arbitrary labels, quoted messages or nested content as clicks.
function nativeReplyToken(reply: unknown): string | null {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return null;
  const tokens = Object.values(reply).filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(v => v.startsWith("fuel:"));
  return tokens.length === 1 ? tokens[0] : tokens.length > 1 ? "fuel:ambiguous" : null;
}

/** Configured groups are always consumed; never leak into another workflow. */
export async function processGroupFuel(client: SupabaseDbClient, input: GroupFuelInput): Promise<boolean> {
  if (process.env.FUEL_GROUP_ENABLED !== "true") return false;
  const configs = bindingsSchema.parse(JSON.parse(process.env.FUEL_GROUP_BINDINGS ?? "[]"));
  if (new Set(configs.map(c => c.groupId)).size !== configs.length) throw new Error("Grupo configurado mais de uma vez.");
  const config = configs.find(c => c.groupId === input.phone);
  if (!config) return false;
  const sender = normalizePhoneDigits(input.participantPhone ?? "");
  const button = nativeReplyToken(input.buttonReply) || input.buttonsResponseMessage?.buttonId?.trim() || input.listResponseMessage?.selectedRowId?.trim() || null;
  const buttonText = input.buttonsResponseMessage?.message?.trim() || input.listResponseMessage?.title?.trim() || "";
  // Shape-only diagnostics: never log phones, names, tokens or media URLs.
  console.info("[fuel-group] received " + JSON.stringify({ allowedSender: config.senders.includes(sender), hasMessageId: Boolean(input.messageId), button: Boolean(button), buttonText: Boolean(buttonText), text: Boolean(input.text?.message), image: Boolean(input.image?.imageUrl), fields: Object.keys(input).filter(k => /^[a-zA-Z]{1,40}$/.test(k)).slice(0, 50) }));
  if (!config.senders.includes(sender) || !input.messageId || (!input.text?.message && !input.image?.imageUrl && !button && !buttonText)) return true;
  const member = await client.from("company_members").select("role").eq("company_id", config.companyId).eq("user_id", config.operatorId).eq("status", "active").maybeSingle();
  if (member.error) throw member.error;
  if (!member.data || !["owner", "admin", "operator"].includes(member.data.role)) return true;
  const [vs, ds, current] = await Promise.all([
    client.from("vehicles").select("id,name,plate,active").eq("company_id", config.companyId).limit(100),
    client.from("drivers").select("id,name,active,phone_e164,vehicle_id,additional_vehicle_id_1,additional_vehicle_id_2").eq("company_id", config.companyId).limit(100),
    client.from("fuel_group_drafts").select("*").eq("company_id", config.companyId).eq("group_id", config.groupId).eq("sender", sender).maybeSingle(),
  ]);
  if (vs.error || ds.error || current.error) throw vs.error ?? ds.error ?? current.error;
  let vehicles = (vs.data ?? []).filter(v => v.active !== false).map(v => ({ ...v, name: v.name ?? v.plate ?? v.id }));
  // BR mobile aliases are compared only after the existing group sender allowlist.
  const phoneKey = (raw: string) => {
    const digits = normalizePhoneDigits(raw);
    return /^55\d{2}9\d{8}$/.test(digits) ? digits.slice(0, 4) + digits.slice(5) : digits;
  };
  const identified = config.dryRun ? (ds.data ?? []).filter(d => d.active !== false && d.phone_e164 && phoneKey(d.phone_e164) === phoneKey(sender)) : [];
  const person = identified.length === 1 ? identified[0] : null;
  const linkedIds = person ? [person.vehicle_id, person.additional_vehicle_id_1, person.additional_vehicle_id_2].filter(Boolean) : [];
  const linkedVehicles = vehicles.filter(v => linkedIds.includes(v.id));
  const linkedPilot = !!person && linkedVehicles.length > 0;
  if (linkedPilot) vehicles = linkedVehicles;
  // Optional group-specific eligibility; never changes the company's driver records.
  // IDs must also belong to the company query above. An empty selection fails closed.
  const drivers = (ds.data ?? []).filter(d => d.active !== false && (!config.driverIds || config.driverIds.includes(d.id) || (linkedPilot && d.id === person!.id))).map(d => ({ ...d, name: d.name ?? d.id })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id));
  const text = (input.text?.message ?? input.image?.caption ?? buttonText).trim();
  const prefix = config.dryRun ? "[TESTE — não grava estoque/despesa]\n" : "";
  const reply = (message: string) => sendWhatsappGroupText(config.groupId, prefix + message);
  if (identified.length > 1) { await reply("Há mais de uma pessoa com esse telefone no cadastro. Confira no painel antes de continuar. Nenhum lançamento realizado."); return true; }
  const args = { p_company: config.companyId, p_user: config.operatorId, p_group: config.groupId, p_sender: sender, p_message: input.messageId, p_dry_run: config.dryRun };
  const draft = current.data;
  const fresh = draft && Date.parse(draft.updated_at) >= Date.now() - 2 * 60 * 60 * 1000;
  const saved = truckFlowSchema.safeParse(fresh ? (draft.evidence as Record<string, unknown>).truckFlow : undefined);
  const initial = (): TruckFlow => ({ ...newTruckFlow(), ...(linkedPilot ? { destinationFirst: true, suggestedDriverId: person!.id } : {}) });
  let state = acceptTruckReadings(saved.success ? saved.data : initial(), vehicles);
  // Refresh identity from the panel, never trust a previously stored suggestion.
  if (linkedPilot) { state.destinationFirst = true; state.suggestedDriverId = person!.id; }
  const field = truckField(state);
  const token = button ?? (text.startsWith("fuel:") ? text : null);
  const namedDrivers = !field && !token ? drivers.filter(d => d.name.trim().toLocaleLowerCase("pt-BR") === text.replace(/^MOTORISTA\s+/i, "").trim().toLocaleLowerCase("pt-BR")) : [];
  const choosingEquipment = state.equipmentMode && field === "plate";
  const choosingDestination = state.destinationFirst && field === "plate";
  const namedVehicle = choosingDestination && !token ? resolveFuelChoice(text, vehicles) : null;
  const namedEquipment = choosingEquipment && !token ? resolveFuelChoice(text, equipmentChoices(vehicles)) : null;
  const moreByText = !token && (!field || choosingEquipment) && fresh && saved.success && /^(MAIS|MAIS OPÇÕES|MAIS OPCOES|MAIS NOMES)$/i.test(text);
  const action = token && fresh && saved.success ? truckAction(token, draft.draft_id, draft.revision) : moreByText ? "more" : namedVehicle ? `vehicle:${namedVehicle.id}` : namedEquipment ? `equipment:${namedEquipment.id}` : namedDrivers.length === 1 ? `driver:${namedDrivers[0].id}` : !field && linkedPilot && /^(SIM|SOU EU)$/i.test(text) ? `driver:${person!.id}` : !field && linkedPilot && /^(OUTRO|OUTRO RESPONSÁVEL|OUTRO RESPONSAVEL)$/i.test(text) ? "otherDriver" : null;
  const emit = async (s: TruckFlow, id: string, revision: number, notice = "", retryPhoto = false) => {
    const prompt = truckPrompt(s, vehicles, drivers, id, revision);
    if (!prompt.buttons.length) { const missing = truckField(s); await reply(notice + (retryPhoto && missing ? truckRequest(missing, true) : prompt.message)); return; }
    // Text is independently delivered: a provider accepting buttons does not prove
    // they render in the group. A typed, unique company driver name remains usable.
    const equipmentStep = (s.equipmentMode || s.destinationFirst) && truckField(s) === "plate";
    const identityStep = !truckField(s) && s.suggestedDriverId && !s.chooseOtherDriver;
    await reply(notice + (equipmentStep || identityStep ? prompt.message + (identityStep ? " Responda SIM ou OUTRO se preferir." : "") : `Identifique-se como ${s.equipmentMode ? "responsável" : "condutor"}. Toque no seu nome nas opções ou digite seu nome completo cadastrado.` + (drivers.length > 2 ? " Para ver outros nomes, toque em Mais opções ou digite MAIS." : "")));
    try { await sendWhatsappGroupButtons(config.groupId, prefix + prompt.message, prompt.buttons); }
    catch {
      console.warn("[fuel-group] button_send_failed");
      await reply(equipmentStep ? "Não consegui enviar os botões. Digite o nome do equipamento cadastrado." : "Não consegui enviar os botões. Digite seu nome completo cadastrado para se identificar. Nenhum abastecimento foi registrado.");
    }
  };
  if (token && !action) { console.info("[fuel-group] stale_button"); await reply("Este botão é antigo ou pertence a outro abastecimento. Envie RESUMO para receber seus botões atuais."); return true; }
  if (state.destinationFirst && !linkedPilot) { await reply("Seu telefone ou vínculos foram alterados no painel. Confira o cadastro antes de continuar. Nenhum lançamento realizado."); return true; }
  if (action?.startsWith("driver:")) {
    const driver = drivers.find(d => d.id === action.slice(7));
    const vehicle = flowVehicle(state, vehicles);
    const offered = truckPrompt(state, vehicles, drivers, draft!.draft_id, draft!.revision).buttons.some(b => b.id === token);
    if (field || !driver || !vehicle || (token && !offered)) { await reply("Identificação inválida. Envie RESUMO para continuar."); return true; }
    if (!config.dryRun && process.env.FUEL_INTERNAL_ENABLED !== "true") { await reply("Registro interno ainda não liberado. Nenhuma baixa realizada."); return true; }
    // Equipment without a counter is pilot-only until storage supports null meters.
    // Never fabricate a zero reading or debit the current single-fuel stock.
    if (state.equipmentMode && !config.dryRun) { await reply("O registro de equipamento sem medidor ainda está em validação. Nenhum lançamento realizado."); return true; }
    const baseCommand = { kind: "withdrawal", requestId: draft!.draft_id, date: fuelLocalDate(new Date(state.startedAt)), liters: state.liters, vehicleId: vehicle.id, driverId: driver.id, meter: state.meter, meterKind: "km" };
    const command = state.equipmentMode ? { ...baseCommand, meter: null, meterKind: null } : fuelStockCommand.parse(baseCommand);
    const result = await client.rpc("fuel_group_step", { ...args, p_action: "confirm", p_patch: {}, p_revision: draft!.revision, p_draft: draft!.draft_id, p_command: command });
    if (result.error) { await reply("Não foi possível concluir. Confira o estoque no painel e envie RESUMO para tentar novamente. Nenhuma confirmação de registro foi emitida."); return true; }
    if ((result.data as { duplicate?: boolean })?.duplicate) return true;
    await reply(`✅ Litragem: ${state.liters!.toLocaleString("pt-BR")} litros\n${state.equipmentMode ? `✅ Equipamento: ${vehicle.name}\n✅ Responsável: ${driver.name}` : `✅ Odômetro: ${state.meter!.toLocaleString("pt-BR")} km\n✅ Placa: ${vehicle.plate}\n✅ Motorista: ${driver.name}`}\n\n${config.dryRun ? "Simulação concluída — nenhum lançamento realizado." : "Abastecimento registrado."}`);
    return true;
  }
  const resetEquipment = /^NOVO EQUIPAMENTO$/i.test(text);
  const reset = /^(NOVO|CANCELAR)$/i.test(text) || resetEquipment;
  const summary = /^(RESUMO|TESTE ABASTECIMENTO)$/i.test(text);
  let notice = "";
  let retryPhoto = false;
  if (reset) state = { ...initial(), ...(resetEquipment && !linkedPilot ? { equipmentMode: true, equipmentId: null } : {}) };
  else if (action?.startsWith("vehicle:") && choosingDestination) {
    const selected = vehicles.find(v => v.id === action.slice(8));
    const offered = truckPrompt(state, vehicles, drivers, draft!.draft_id, draft!.revision).buttons.some(b => b.id === token);
    if (!selected || (token && !offered)) { await reply("Opção inválida. Envie RESUMO para continuar."); return true; }
    const equipment = equipmentChoices([selected]).length > 0;
    state = acceptTruckReadings({ ...state, equipmentMode: equipment, equipmentId: equipment ? selected.id : null, plate: equipment ? null : selected.plate, page: 0 }, vehicles);
    notice = `✅ ${equipment ? "Equipamento" : "Veículo"}: ${selected.name}.\n`;
  }
  else if (action === "otherDriver" && !field && linkedPilot) { state.chooseOtherDriver = true; state.page = 0; }
  else if (action?.startsWith("equipment:") && choosingEquipment) {
    const selected = equipmentChoices(vehicles).find(v => v.id === action.slice(10));
    const offered = truckPrompt(state, vehicles, drivers, draft!.draft_id, draft!.revision).buttons.some(b => b.id === token);
    if (!selected || (token && !offered)) { await reply("Equipamento inválido. Envie RESUMO para continuar."); return true; }
    state = acceptTruckReadings({ ...state, equipmentId: selected.id, page: 0 }, vehicles);
    notice = `✅ Equipamento: ${selected.name}.\n`;
  }
  else if (action === "more" && (!field || choosingEquipment)) {
    state.page = (state.page + 1) % Math.max(1, Math.ceil((choosingEquipment ? equipmentChoices(vehicles).length : drivers.length) / 2));
    console.info("[fuel-group] driver_page", { page: state.page + 1, count: drivers.length });
  }
  else if (action) { await reply("Esta opção não corresponde à etapa atual. Envie RESUMO."); return true; }
  else if (!summary) {
    if (!field) { await reply("Não identifiquei um único condutor com esse nome. Digite seu nome completo cadastrado ou envie RESUMO para ver as opções."); return true; }
    try {
      if (choosingEquipment || choosingDestination) { await emit(state, draft!.draft_id, draft!.revision, "Não identifiquei um único veículo/equipamento com esse nome. "); return true; }
      const typed = !input.image?.imageUrl ? typedTruckEvidence(text, field) : null;
      const explicit = typed
        ? fuelEvidenceSchema.parse({ ...emptyFuelEvidence, ...typed })
        : await extractFuelEvidence(text, input.image);
      const before = state;
      state = acceptTruckReadings(applyTruckEvidence(state, explicit), vehicles);
      if (state.equipmentMode) {
        const selected = resolveFuelChoice(explicit.vehicle, equipmentChoices(vehicles)) || resolveFuelChoice(text, equipmentChoices(vehicles));
        if (selected) state = acceptTruckReadings({ ...state, equipmentId: selected.id, page: 0 }, vehicles);
      }
      notice = (["liters", "meter", "plate"] as const).filter(f => !before.confirmed[f] && state.confirmed[f] && (!state.equipmentMode || f === "liters")).map(f => `✅ ${truckLabel(f)} confirmad${f === "meter" ? "o" : "a"}: ${typeof state[f] === "number" ? state[f].toLocaleString("pt-BR") : state[f]}${f === "liters" ? " litros" : f === "meter" ? " km" : ""}.\n`).join("");
      if (state.equipmentMode && !before.equipmentId && state.equipmentId) notice += `✅ Equipamento: ${flowVehicle(state, vehicles)!.name}.\n`;
      if (!notice && input.image?.imageUrl && !state.confirmed[field]) { notice = "Não consegui identificar esse dado com segurança. "; retryPhoto = true; }
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
      console.warn("[fuel-group] extraction_failed", { status, image: Boolean(input.image?.imageUrl) });
      await reply(status !== null ? "O serviço de leitura está indisponível. Seus dados anteriores foram mantidos. Tente novamente mais tarde." : `Não consegui ler com segurança. ${field ? truckRequest(field, true) : "Envie RESUMO para continuar."}`);
      return true;
    }
  }
  const result = await client.rpc("fuel_group_step", { ...args, p_action: reset ? "reset" : "merge", p_patch: { truckFlow: state }, p_revision: draft?.revision ?? 0, p_draft: draft?.draft_id });
  if (result.error) { await reply("Outra mensagem atualizou este abastecimento. Envie RESUMO e repita somente o último dado se faltar."); return true; }
  if ((result.data as { duplicate?: boolean })?.duplicate) return true;
  const updated = result.data as { evidence: { truckFlow: unknown }; draft_id: string; revision: number };
  await emit(truckFlowSchema.parse(updated.evidence.truckFlow), updated.draft_id, updated.revision, notice, retryPhoto);
  return true;
}

