import { configurationCatalog } from "@/lib/frota/vehicleConfigurations";

export interface VehicleSetup {
  kind?: "cavalo" | "caminhao";
  formula?: string;
  configurationId?: string;
  motorAxles?: number;
  attached?: boolean;
  implement?: string;
  implementAxles?: number;
  totalAxles?: number;
  complete?: boolean;
  label?: string;
}

/** Configuration is supplied by the customer, never inferred from brand/model. */
export function nextVehicleConfiguration(previous: VehicleSetup = {}, input: string) {
  const data = { ...previous };
  const t = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/cavalo/.test(t)) data.kind = "cavalo";
  else if (/rigido|toco|truck|truque|trucado|bitruck|bitruque|tres.quartos|3\/4/.test(t)) data.kind = "caminhao";
  const formula = t.match(/\b(4|6|8|10)\s*(?:x|×|por)\s*(2|4|6)\b/);
  if (formula) data.formula = `${formula[1]}x${formula[2]}`;
  const ask = (question: string) => ({ data, question });
  if (!data.kind) return ask("É cavalo mecânico (puxa carreta), toco, truck/trucado ou bitruck? Pode escrever como você conhece o caminhão.");
  if (!data.formula) return ask("Qual a tração do caminhão? Ex.: 4x2, 6x2, 6x4 ou 8x4.");
  const id = `${data.kind}-${data.formula}`;
  const configuration = configurationCatalog[id];
  if (!configuration) return ask("Essa configuração ainda não está no catálogo. Confira a tração informada; não vou substituir por outro modelo.");
  data.configurationId = id;
  data.motorAxles = configuration.axes.length;
  // Separate towing vehicle from attached equipment; never assume trailer axle count.
  if (/sem (carreta|implemento|reboque)|nao (esta )?(engatado|atrelado)|^(nao|não)$/.test(t)) data.attached = false;
  const implement = t.match(/rodotrem|bitrem|julieta|semirreboque|semi.reboque|carreta|reboque|\bls\b/);
  if (implement && data.attached !== false) { data.attached = true; data.implement = implement[0]; }
  if (/^(sim|engatado|atrelado)$/.test(t)) data.attached = true;
  if (data.attached === undefined) return ask("Trabalha puxando alguma carreta ou reboque? Se não, responda não. Se sim, diga se é carreta/LS, bitrem, rodotrem ou Julieta e quantos eixos têm os implementos, sem contar o caminhão.");
  if (data.attached) {
    if (!data.implement) return ask("Qual o implemento engatado: semirreboque/carreta, Julieta, bitrem ou rodotrem? Informe também o total de eixos dos implementos, incluindo dolly se houver, sem contar o caminhão.");
    const axes = t.match(/\b(\d{1,2})\s*eixos?\b/) ?? (/^\d{1,2}$/.test(t) ? [t, t] : null);
    if (axes && Number(axes[1]) >= 1 && Number(axes[1]) <= 12) data.implementAxles = Number(axes[1]);
    if (!data.implementAxles) return ask("Quantos eixos têm os implementos engatados no total? Inclua o dolly, se houver, e não conte os eixos do caminhão.");
  } else { data.implement = undefined; data.implementAxles = 0; }
  data.totalAxles = data.motorAxles + (data.implementAxles ?? 0);
  data.complete = true;
  data.label = `${configuration.label} (${data.motorAxles} eixos no caminhão) · ${data.attached ? `${data.implement}, ${data.implementAxles} eixos nos implementos; conjunto com ${data.totalAxles} eixos` : "sem implemento engatado"}`;
  return ask("");
}
