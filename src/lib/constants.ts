import type { SuggestionPrompt } from "@/types";

export const APP_NAME = "Frota IA Assistente";

export const APP_TAGLINE = "Seu especialista virtual em transporte e gestão de frotas";

// Textos da apresentação inicial (tela de boas-vindas).
export const GREETING_TITLE = "Olá!";
export const GREETING_INTRO = "Sou o Frota IA Assistente.";
export const GREETING_SUBTITLE = "Especialista em transporte e gestão de frotas.";
export const GREETING_HELP_LABEL = "Posso ajudar você com:";
export const GREETING_CLOSING = "Como posso ajudar hoje?";
export const GREETING_TOPICS = [
  "Fretes",
  "Custos",
  "CPK",
  "Pneus",
  "Diesel",
  "Gestão de Frotas",
];

export const INPUT_PLACEHOLDER =
  "Pergunte qualquer coisa sobre transporte, custos, pneus, fretes ou gestão de frotas…";

export const FOOTER_DISCLAIMER =
  "As análises são baseadas nas informações fornecidas. Sempre valide decisões operacionais importantes antes da execução.";

export const ERROR_RESPONSE =
  "Não foi possível concluir sua análise agora. Tente novamente em alguns instantes.";

export const SUGGESTION_PROMPTS: SuggestionPrompt[] = [
  {
    id: "analisar-frete",
    label: "Analisar um frete",
    description: "Descubra se esse frete gera lucro antes de aceitar.",
    prompt: "Esse frete compensa?",
    icon: "package",
  },
  {
    id: "calcular-consumo",
    label: "Consumo",
    description: "Veja quanto o diesel está impactando sua operação.",
    prompt: "Meu caminhão está fazendo 2,8 km/l. Isso é bom?",
    icon: "fuel",
  },
  {
    id: "comparar-pneus",
    label: "Comparar pneus",
    description: "Compare pneus novos, recapados e o CPK.",
    prompt: "Vale mais a pena recapar ou comprar um pneu novo?",
    icon: "circleDot",
  },
  {
    id: "calcular-cpk",
    label: "Calcular CPK",
    description: "Descubra o custo real por quilômetro.",
    prompt: "Como calcular CPK?",
    icon: "barChart3",
  },
  {
    id: "reduzir-custos",
    label: "Reduzir custos",
    description: "Identifique oportunidades de economia na operação.",
    prompt: "Como reduzir o custo da frota?",
    icon: "wallet",
  },
  {
    id: "gestao-frota",
    label: "Gestão da Frota",
    description: "Tire dúvidas técnicas sobre transporte.",
    prompt: "Quais são os principais indicadores para gerir minha frota?",
    icon: "truck",
  },
];
