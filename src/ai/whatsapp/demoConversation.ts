import type { FrotaIaToolName } from "@/lib/supabase/tables";
import type { OnboardingReply } from "./onboardingConversation";
import { APRESENTACAO_V1 } from "./conversationExperience";

// IDs antigos permanecem válidos para sessões e listas já enviadas.
export type DemoTrack = "frete" | "rota" | "custo" | "combustivel" | "manutencao" | "pneus" | "livre";
export function askDemoChoice(): OnboardingReply {
  return { kind: "list", text: APRESENTACAO_V1, title: "Experimente na prática", buttonLabel: "Escolher assunto", options: [
    { id: "combustivel", title: "Combustível" }, { id: "manutencao", title: "Manutenção" },
    { id: "pneus", title: "Pneus" }, { id: "frete", title: "Fretes e oportunidades" },
    { id: "funcionalidades", title: "O que mais você faz?" },
  ] };
}
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
export function resolverEscolhaDemo(texto: string): DemoTrack | "funcionalidades" | null {
  const t = norm(texto);
  if (Object.hasOwn(FERRAMENTAS_POR_TRACK, t)) return t as DemoTrack;
  if (/funcionalidades|conhecer.*fun|o que.*faz|ver tudo/.test(t)) return "funcionalidades";
  if (/\b(pneu|pneus|recapar|recapagem|recapado)\b/.test(t)) return "pneus";
  if (/\b(manutencao|revisao|oficina|oleo|barulho)\b/.test(t)) return "manutencao";
  if (/\b(frete|fretes|carga|retorno|oportunidades)\b/.test(t)) return "frete";
  if (/\b(diesel|gasolina|combustivel|litros?|consumo|abasteci|abastecimento)\b|bebendo demais/.test(t)) return "combustivel";
  if (/\b(rota|distancia|trajeto)\b/.test(t)) return "rota";
  if (/\b(custo|custos|viagem)\b/.test(t)) return "custo";
  return null;
}
export function ehAtalhoDemo(texto: string): boolean {
  return /^(frete|fretes e oportunidades|rota|custo|combustivel|manutencao|pneus|livre|analisar um frete|calcular uma rota|calcular custo de viagem)$/.test(norm(texto));
}
export const TRANSICAO_POR_TRACK: Record<DemoTrack, string> = {
  frete: "Me mande a oferta do frete e o que já sabe da viagem. Para carga de retorno, explico como o Radar funciona nas fontes disponíveis.",
  rota: "De onde você sai e para onde vai? Vou consultar a distância e o tempo estimado.",
  custo: "Qual o percurso total e quanto seu caminhão faz por litro? Pode mandar os dados que já tiver.",
  combustivel: "Quer calcular o gasto da viagem ou conferir o consumo? Pode me contar ou mandar os dados do abastecimento.",
  manutencao: "O que você precisa ver: uma revisão, um gasto ou uma dúvida de manutenção? No teste posso orientar, sem agendar ou registrar serviços.",
  pneus: "Quer comparar pneus ou entender o custo de rodar? Me mande os preços e a duração que você conhece, se tiver.",
  livre: "O que você quer conferir? Posso interpretar os dados e demonstrar uma análise, sem registrar gastos neste teste.",
};
// Demonstração só usa ferramentas sem escrita operacional.
export const FERRAMENTAS_POR_TRACK: Record<DemoTrack, FrotaIaToolName[]> = {
  frete: ["analisar_frete", "calcular_margem", "calcular_valor_minimo_frete", "verificar_piso_minimo_antt"],
  rota: ["consultar_rota"], custo: ["calcular_custo_viagem", "calcular_combustivel"],
  combustivel: ["calcular_combustivel", "calcular_custo_viagem"],
  manutencao: ["consultar_conhecimento_operacional", "calcular_cpk"],
  pneus: ["comparar_pneus", "calcular_cpk", "consultar_conhecimento_operacional"],
  livre: ["analisar_frete", "calcular_combustivel", "calcular_custo_viagem", "calcular_cpk", "calcular_margem", "calcular_valor_minimo_frete", "comparar_pneus", "consultar_rota", "consultar_conhecimento_operacional", "verificar_piso_minimo_antt"],
};
export const FERRAMENTA_ALVO_POR_TRACK: Record<DemoTrack, FrotaIaToolName> = {
  frete: "analisar_frete", rota: "consultar_rota", custo: "calcular_custo_viagem",
  combustivel: "calcular_combustivel", manutencao: "consultar_conhecimento_operacional", pneus: "comparar_pneus", livre: "analisar_frete",
};
export function demoEntregouValor(track: DemoTrack, executadas: string[] = []): boolean {
  return executadas.some(nome => FERRAMENTAS_POR_TRACK[track].includes(nome as FrotaIaToolName));
}
