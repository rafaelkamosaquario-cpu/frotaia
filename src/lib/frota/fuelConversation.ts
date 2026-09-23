import { resolveFuelChoice, type FuelChoice, type FuelEvidence } from "./fuelGroup";

export function fuelLocalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function fuelConversation(e: FuelEvidence, vehicles: FuelChoice[], drivers: FuelChoice[]) {
  const vehicle = resolveFuelChoice(e.vehicle, vehicles);
  const known = [
    vehicle ? `Placa/equipamento: ${vehicle.plate ?? vehicle.name}` : null,
    e.meter !== null && e.meterKind ? `${e.meterKind === "km" ? "Quilometragem total" : "Horímetro"}: ${e.meter.toLocaleString("pt-BR")}` : null,
    e.liters !== null ? `Litros: ${e.liters.toLocaleString("pt-BR")}` : null,
  ].filter(Boolean).join("\n");
  let question: string;
  if (e.liters === null) question = "Envie a foto da bomba. Se já enviou, não consegui ler a litragem com segurança: envie outra foto ou digite quantos litros foram (ex.: 162 litros).";
  else if (e.meter === null || !e.meterKind) question = "Envie a foto do painel mostrando o odômetro total (não TRIP), ou informe a leitura com km ou horas.";
  else if (!vehicle) question = `Envie a foto da placa ou informe um equipamento cadastrado:\n${vehicles.map(v => v.plate ?? v.name).join("\n") || "Nenhum equipamento cadastrado; confira no painel."}`;
  else question = `Escolha o condutor deste abastecimento. Responda MOTORISTA seguido do nome:\n${drivers.map(d => d.name).join("\n") || "Nenhum condutor cadastrado; confira no painel."}\nA escolha conclui o registro. Se algum dado acima estiver errado, envie a correção antes de escolher.`;
  return `${known ? `Identifiquei:\n${known}\n\n` : ""}${question}\nPara iniciar outro abastecimento, envie NOVO.`;
}

/** A photo/model cannot authorize completion: it requires a separate, explicit company driver choice. */
export function selectedFuelDriver(text: string, e: FuelEvidence, vehicles: FuelChoice[], drivers: FuelChoice[]) {
  if (!resolveFuelChoice(e.vehicle, vehicles) || e.liters === null || e.meter === null || !e.meterKind || !e.date) return null;
  const name = text.trim().replace(/^MOTORISTA\s+/i, "");
  return resolveFuelChoice(name, drivers);
}
