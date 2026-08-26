/**
 * Ajuda contextual leve do Painel (V2), 08/2026 — conteúdo centralizado
 * (seção 23 da spec: sem espalhar o mesmo texto em vários componentes).
 * Aplicado só num subconjunto representativo das telas priorizadas na
 * spec (Dashboard/Manutenção/Despesas/Radar) — "não fazer em todas as
 * telas se isso virar excesso" é uma instrução explícita; o restante
 * (Checklists/Alertas/Agenda/Documentos) fica como extensão trivial: só
 * adicionar uma entrada aqui + `<ContextualHelp topic="..." />` na página.
 */

export type ContextualHelpTopic = "dashboard" | "manutencao" | "despesas" | "radar";

export interface ContextualHelpContent {
  titulo: string;
  texto: string;
  exemplo: string;
  perguntaParaIA: string;
}

export const CONTEXTUAL_HELP_CONTENT: Record<ContextualHelpTopic, ContextualHelpContent> = {
  dashboard: {
    titulo: "Como funciona o Dashboard",
    texto: "Aqui você vê um resumo da operação — indicadores principais, alertas urgentes e o que o Frota IA identificou como prioridade.",
    exemplo: "O que precisa da minha atenção hoje?",
    perguntaParaIA: "O que precisa da minha atenção hoje?",
  },
  manutencao: {
    titulo: "Como registrar manutenção",
    texto: "Você pode registrar uma manutenção pelo painel ou pelo WhatsApp — os dois ficam na mesma operação.",
    exemplo: "Troquei o óleo do Scania hoje por R$ 1.200.",
    perguntaParaIA: "Como registro uma manutenção pelo WhatsApp?",
  },
  despesas: {
    titulo: "Como registrar despesas",
    texto: "Registre despesas direto pelo painel ou mande uma mensagem pelo WhatsApp — eu organizo tudo na mesma operação.",
    exemplo: "Registre R$ 850 de combustível no Scania.",
    perguntaParaIA: "Como registro uma despesa pelo WhatsApp?",
  },
  radar: {
    titulo: "Como funciona o Radar de Fretes",
    texto: "Crie um Radar pra acompanhar oportunidades de frete compatíveis com sua operação — é acompanhamento, não marketplace nem contratação automática.",
    exemplo: "Quero criar um radar de fretes para minha rota.",
    perguntaParaIA: "Como funciona o Radar de Fretes?",
  },
};
