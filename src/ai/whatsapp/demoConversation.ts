import type { FrotaIaToolName } from "@/lib/supabase/tables";
import type { OnboardingReply } from "./onboardingConversation";

/**
 * Menu pré-cadastro da inversão do funil (09/2026, "mostrar valor antes de
 * cadastrar" — a pedido do Rafael). Roda logo no primeiro contato, com a
 * empresa mínima já criada (ver `criarEmpresaMinima` em
 * finalizeOnboarding.ts) mas ANTES das 11+1 perguntas de perfil (que agora
 * só rodam depois do pagamento). Função pura, sem I/O — mesmo princípio de
 * `onboardingConversation.ts`, só que pequena o bastante (1 escolha, sem
 * cadeia de perguntas) pra não precisar do mesmo formato de máquina de
 * estado: as transições de `onboarding_sessions.state` ficam no
 * webhook/route.ts, que já é quem monta o restante do fluxo de demo
 * (handoff pra `gerarRespostaAssistente` em modo restrito).
 */

export type DemoTrack = "frete" | "rota" | "custo";

const OPCOES_DEMO: Array<{ id: DemoTrack | "funcionalidades"; title: string }> = [
  { id: "frete", title: "🚛 Analisar um frete" },
  { id: "rota", title: "🗺️ Calcular uma rota" },
  { id: "custo", title: "💰 Calcular custo de viagem" },
  { id: "funcionalidades", title: "📋 Conhecer o que o Frota IA faz" },
];

/**
 * Texto curto, focado em mostrar valor rápido — deliberadamente mais
 * enxuto que o `firstOnboardingMessage()` antigo (que já emendava pra
 * pedir nome/perfil). Aqui ainda não se pede nenhum dado de cadastro.
 */
export function askDemoChoice(): OnboardingReply {
  return {
    kind: "list",
    text:
      "Olá! Eu sou o Frota IA, seu gestor de frota direto no WhatsApp. 🚛\n\n" +
      "Posso ajudar você a saber se um frete compensa, calcular custos e rotas, controlar combustível, pneus e manutenção, acompanhar documentos e alertas e consultar informações atualizadas do transporte.\n\n" +
      "Você pode falar comigo por texto, áudio, foto ou documento.\n\n" +
      "Quer ver como funciona na prática?",
    title: "Escolha um teste",
    buttonLabel: "Escolher opção",
    options: OPCOES_DEMO.map((o) => ({ id: o.id, title: o.title })),
  };
}

/** Aceita o id da lista (toque) ou, como fallback, o título/texto digitado — mesmo padrão de resolverIntencao em onboardingConversation.ts. */
export function resolverEscolhaDemo(texto: string): DemoTrack | "funcionalidades" | null {
  const t = texto.trim().toLowerCase();
  const porId = OPCOES_DEMO.find((o) => o.id === t);
  if (porId) return porId.id;
  const porTitulo = OPCOES_DEMO.find((o) => t.includes(o.title.replace(/^\S+\s/, "").toLowerCase()));
  return porTitulo?.id ?? null;
}

/**
 * Pergunta de transição fixa ao entrar em `awaiting_demo_input` — pede só
 * o dado necessário pro cálculo daquele track, nunca nome/perfil/cidade/
 * veículo. Só promete TEXTO (achado real, 11/09/2026): o handler de
 * `awaiting_demo_input` no webhook só resolve `textoDireto` nesta fase —
 * foto/PDF/áudio ainda não têm o mesmo tratamento multimodal do fluxo
 * pós-cadastro, então prometer isso aqui geraria expectativa que o
 * produto não cumpre ainda.
 */
export const TRANSICAO_POR_TRACK: Record<DemoTrack, string> = {
  frete: "Perfeito. Me mande os dados do frete — origem, destino, valor ofertado e o que mais você tiver.",
  rota: "Perfeito. Me diga a origem e o destino que eu calculo a distância e a duração real da rota.",
  custo: "Perfeito. Me conta o trajeto (ou a rota) e o consumo do seu veículo — ou os dados que você já tiver — que eu calculo o custo da viagem.",
};

/**
 * Ferramentas liberadas pra IA em `awaiting_demo_input`, por track — nunca
 * as 39 completas (decisão confirmada com o Rafael). Cada lista cobre o
 * cálculo-alvo do track + o que a IA precisaria pra chegar lá numa
 * conversa real (ex.: frete pode precisar saber se bate o piso legal).
 */
export const FERRAMENTAS_POR_TRACK: Record<DemoTrack, FrotaIaToolName[]> = {
  frete: ["analisar_frete", "calcular_margem", "calcular_valor_minimo_frete", "verificar_piso_minimo_antt"],
  rota: ["consultar_rota"],
  custo: ["calcular_custo_viagem", "calcular_combustivel"],
};

/** Ferramenta cujo sucesso marca "demo entregue" (dispara o CTA pós-demo em webhook/route.ts) — a primeira/principal de cada track. */
export const FERRAMENTA_ALVO_POR_TRACK: Record<DemoTrack, FrotaIaToolName> = {
  frete: "analisar_frete",
  rota: "consultar_rota",
  custo: "calcular_custo_viagem",
};
