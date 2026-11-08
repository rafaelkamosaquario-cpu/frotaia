export interface CargoProfile {
  type?: string;
  weightTonnes?: number;
  weightBasis?: "carga" | "pbt" | "pbtc";
  weightSkipped?: boolean;
  complete?: boolean;
}
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export const cargoQuestion = "Que tipo de carga você costuma transportar? Ex.: carga seca, carga fracionada, grãos, madeira ou líquidos. Baú e graneleiro são tipos de carroceria; aqui quero saber a carga.";
export const weightQuestion = "Qual o peso habitual transportado? Informe o valor em toneladas ou kg e se é só a carga, o peso bruto do caminhão carregado (PBT), ou do conjunto completo (PBTC). Se varia ou não sabe, pode dizer isso.";
export function nextCargoProfile(previous: CargoProfile = {}, input: string): { data: CargoProfile; question: string } {
  const data = { ...previous }; const t = norm(input);
  const ask = (question: string) => ({ data, question });
  if (!data.type) {
    if (!t || /^(bau|graneleiro|sider|tanque|basculante)$/.test(t)) return ask(cargoQuestion);
    data.type = input.trim().slice(0,200);
    return ask(weightQuestion);
  }
  if (/^(nao sei|nao tenho|varia|variavel|depois)/.test(t)) { data.weightSkipped = true; data.complete = true; return ask(""); }
  if (/-\s*\d/.test(t)) return ask("Confira o peso: informe um valor positivo em toneladas ou kg.");
  const match = t.match(/\b(\d+(?:\.\d{3})*(?:,\d+)?|\d+\.\d+)\s*(t\b|toneladas?|ton\b|kg\b|quilos?\b)/);
  if (match) {
    const numeric = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(match[1]) ? match[1].replace(/\./g, "") : match[1];
    const value = Number(numeric.replace(",", ".")) / (/kg|quilo/.test(match[2]) ? 1000 : 1);
    if (!Number.isFinite(value) || value <= 0 || value > 300) return ask("Confira o peso e a unidade. Informe toneladas ou kg; não vou estimar o valor.");
    data.weightTonnes = value;
  }
  if (/pbtc|bruto.*conjunto|conjunto.*completo/.test(t)) data.weightBasis = "pbtc";
  else if (/\bpbt\b|\bptb\b|peso bruto total|bruto.*caminhao/.test(t)) data.weightBasis = "pbt";
  else if (/so (a |da )?carga|peso (da |de )carga|carga liquida|^carga$/.test(t)) data.weightBasis = "carga";
  if (!data.weightTonnes) return ask(weightQuestion);
  if (!data.weightBasis) return ask(`Essas ${data.weightTonnes} toneladas são só da carga, o peso bruto do caminhão carregado (PBT), ou o peso bruto do conjunto completo (PBTC)?`);
  data.complete = true; return ask("");
}
export function cargoSummary(data?: CargoProfile) {
  if (!data) return "Carga e peso não informados";
  const labels = { carga: "somente carga", pbt: "PBT informado", pbtc: "PBTC informado" };
  return `Carga: ${data.type ?? "não informada"}; peso habitual: ${data.weightTonnes && data.weightBasis ? `${data.weightTonnes} t (${labels[data.weightBasis]})` : "não informado/variável"}. Peso declarado pelo cliente; não é capacidade legal verificada.`;
}
