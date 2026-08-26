import type { OnboardingReply } from "./onboardingConversation";
import type { GuideStatus } from "@/services/supabase/companyPreferencesService";

/**
 * Guia de Primeiros Passos — V1 WhatsApp (08/2026). Máquina de estados
 * DETERMINÍSTICA (nunca a IA decide passo/transição/conclusão — pedido
 * explícito), mesmo espírito de `onboardingConversation.ts`/
 * `vehicleConfigClassifier.ts`: funções puras, sem I/O, sem `async`. Estado
 * persistido em `company_preferences.guide_v1_*` (ver
 * `companyPreferencesService.ts`), nunca em `onboarding_sessions` — guia ≠
 * onboarding.
 *
 * Reaproveita o formato `OnboardingReply` (list/text) — nunca "buttons"
 * (instabilidade real e documentada: `sendWhatsappButtons` falhou
 * silenciosamente em teste, 05/08/2026; listas nativas são o mecanismo
 * comprovado, usado em todo o resto do onboarding/sugestões).
 */

export const GUIDE_V1_STEPS = ["veiculo", "frete", "custos", "registro", "radar", "final"] as const;
export type GuideStepV1 = (typeof GUIDE_V1_STEPS)[number];

const TOTAL_PASSOS = GUIDE_V1_STEPS.length;

export type GuideReplyV1 = OnboardingReply;

export interface GuideVehicleSummary {
  /** Ex.: "Scania R450 2022" — já formatado por quem chama, este módulo nunca lê o banco. */
  label: string;
  configuracao?: string;
  /** Ex.: "2.8 km/l" — já formatado. */
  consumo?: string;
}

export interface GuideContextV1 {
  vehicle?: GuideVehicleSummary;
  /** `collectedData.intentId` salvo no onboarding — usado só pra destacar/prefixar um passo, nunca pra reordenar ou pular (seção 7: "mesma sequência + texto adaptado"). */
  intentId?: string;
}

export const GUIDE_V1_CONTROL_IDS = {
  start: "guide_v1_start",
  later: "guide_v1_later",
  noThanks: "guide_v1_no_thanks",
  next: "guide_v1_next",
  exit: "guide_v1_exit",
  restart: "guide_v1_restart",
  resume: "guide_v1_resume",
} as const;

export type GuideControlV1 = keyof typeof GUIDE_V1_CONTROL_IDS;

const SINONIMOS_CONTROLE: Record<GuideControlV1, string[]> = {
  start: ["fazer agora", "quero", "vamos", "iniciar guia", "bora"],
  later: ["depois", "mais tarde", "agora nao", "agora não"],
  noThanks: ["nao preciso", "não preciso", "nao quero", "não quero", "dispensar"],
  next: ["proximo", "próximo", "pular", "ver proximo", "ver próximo", "continuar", "avancar", "avançar", "seguir", "ok"],
  exit: ["sair", "sair do guia", "parar guia", "encerrar guia", "sair do tour"],
  restart: ["recomecar", "recomeçar", "reiniciar", "do zero"],
  resume: ["retomar", "voltar pro guia"],
};

function norm(texto: string): string {
  return texto.trim().toLowerCase();
}

/**
 * Reconhece um controle de UI do guia (toque em lista ou sinônimo digitado).
 * Retorna `null` pra qualquer coisa que não seja um controle reconhecido —
 * quem chama deve então deixar a mensagem cair pro fluxo normal (IA), nunca
 * forçar interpretação (seção 8: dúvida durante o guia não trava o passo).
 */
export function interpretarControleGuiaV1(entrada: string | undefined | null): GuideControlV1 | null {
  if (!entrada) return null;

  const porId = (Object.entries(GUIDE_V1_CONTROL_IDS) as [GuideControlV1, string][]).find(([, id]) => id === entrada);
  if (porId) return porId[0];

  const t = norm(entrada);
  if (t.length > 40) return null; // controle de UI é sempre curto — mensagem longa é conteúdo, nunca comando

  for (const [chave, sinonimos] of Object.entries(SINONIMOS_CONTROLE) as [GuideControlV1, string[]][]) {
    if (sinonimos.some((s) => t === s || t.includes(s))) return chave;
  }
  return null;
}

function listReply(text: string, options: Array<{ id: string; title: string }>): GuideReplyV1 {
  return { kind: "list", text, title: "Guia rápido", buttonLabel: "Escolher", options };
}

const OPCOES_PASSO = [
  { id: GUIDE_V1_CONTROL_IDS.next, title: "Próximo" },
  { id: GUIDE_V1_CONTROL_IDS.exit, title: "Sair do guia" },
];

function progresso(numero: number): string {
  return `(passo ${numero} de ${TOTAL_PASSOS})`;
}

/** Destaque por intenção salva no onboarding (seção 7) — mesma sequência de sempre, só um prefixo curto no passo mais relevante. Nunca reordena, nunca pula. */
const DESTAQUE_POR_PASSO: Partial<Record<GuideStepV1, string[]>> = {
  frete: ["fretes"],
  custos: ["combustivel_custos"],
  registro: ["pneus_manutencao", "documentos", "alertas_agenda"],
  radar: ["fretes"],
};

function prefixoPersonalizado(passo: GuideStepV1, intentId: string | undefined): string {
  if (!intentId) return "";
  const intencoesDestacadas = DESTAQUE_POR_PASSO[passo];
  if (!intencoesDestacadas?.includes(intentId)) return "";
  return "Como você disse que queria focar nisso, esse passo é especialmente pra você: ";
}

const STEP_BUILDERS: Record<GuideStepV1, (ctx: GuideContextV1) => GuideReplyV1> = {
  veiculo: (ctx) => {
    const resumo = ctx.vehicle
      ? ` Seu veículo cadastrado: ${ctx.vehicle.label}${ctx.vehicle.configuracao ? ` — ${ctx.vehicle.configuracao}` : ""}${ctx.vehicle.consumo ? `, consumo médio ${ctx.vehicle.consumo}` : ""}.`
      : "";
    return listReply(
      `${progresso(1)} ${prefixoPersonalizado("veiculo", ctx.intentId)}Seu veículo já está salvo. Quando você pedir cálculos ou análises, o Frota IA usa os dados cadastrados automaticamente.${resumo}`,
      OPCOES_PASSO
    );
  },
  frete: (ctx) =>
    listReply(
      `${progresso(2)} ${prefixoPersonalizado("frete", ctx.intentId)}Você pode me mandar uma proposta de frete e perguntar se compensa.\n\nExemplo: "Curitiba → São Paulo por R$ 5.200. Compensa?"\n\nSe quiser, digite um exemplo de verdade agora que eu já analiso de verdade — ou toque em Próximo pra seguir o guia.`,
      OPCOES_PASSO
    ),
  custos: (ctx) =>
    listReply(
      `${progresso(3)} ${prefixoPersonalizado("custos", ctx.intentId)}Você também pode pedir combustível, custo de viagem, CPK, margem, receita por km ou custo de veículo parado.\n\nExemplo: "Quanto gasto de combustível de Curitiba a Campinas?"`,
      OPCOES_PASSO
    ),
  registro: (ctx) =>
    listReply(
      `${progresso(4)} ${prefixoPersonalizado("registro", ctx.intentId)}Dá pra registrar despesa, manutenção, documento ou lembrete direto por aqui.\n\nExemplo: "Registre R$ 850 de manutenção no Scania."`,
      OPCOES_PASSO
    ),
  radar: (ctx) =>
    listReply(
      `${progresso(5)} ${prefixoPersonalizado("radar", ctx.intentId)}Você pode criar um Radar pra acompanhar oportunidades de frete compatíveis com sua operação — é acompanhamento, não marketplace nem negociação automática.`,
      OPCOES_PASSO
    ),
  final: () => ({
    kind: "text",
    text: `${progresso(6)} Pronto! Você já conhece o essencial do Frota IA.\n\nQuando precisar, escreva "primeiros passos" que eu reabro esse guia.\n\nOu simplesmente pergunte: "O que você consegue fazer?"`,
  }),
};

export function buildGuideStepReplyV1(step: GuideStepV1, ctx: GuideContextV1): GuideReplyV1 {
  return STEP_BUILDERS[step](ctx);
}

export function proximoPassoV1(step: GuideStepV1): GuideStepV1 | null {
  const indice = GUIDE_V1_STEPS.indexOf(step);
  return indice >= 0 && indice < GUIDE_V1_STEPS.length - 1 ? GUIDE_V1_STEPS[indice + 1] : null;
}

export function indiceDoPassoV1(step: GuideStepV1): number {
  return GUIDE_V1_STEPS.indexOf(step) + 1;
}

/** Convite inicial, enviado uma única vez logo após o onboarding concluir (ver finalizeOnboarding/webhook). */
export function buildGuideOfferV1(): GuideReplyV1 {
  return listReply(
    "Seu Frota IA está pronto. Quer fazer um guia rápido (5 passos, menos de 2 minutos) pra conhecer as principais funções?",
    [
      { id: GUIDE_V1_CONTROL_IDS.start, title: "Fazer agora" },
      { id: GUIDE_V1_CONTROL_IDS.later, title: "Depois" },
      { id: GUIDE_V1_CONTROL_IDS.noThanks, title: "Não preciso" },
    ]
  );
}

/**
 * Reabertura manual (comando "primeiros passos"/"tutorial"/etc, ver
 * ehPedidoDeGuia em helpMenu.ts). `stepAtual` reflete a ÚLTIMA posição
 * conhecida e sobrevive a "sair do guia" (só é limpo ao concluir) — por
 * isso a checagem é sobre `stepAtual`, não sobre `status`: um guia
 * pausado no meio sempre oferece retomar, não importa se o status ficou
 * `dismissed` (saiu) ou `not_started` (escolheu "depois").
 */
export function buildGuideReabrirV1(status: GuideStatus, stepAtual: GuideStepV1 | null): GuideReplyV1 {
  if (stepAtual) {
    return listReply(`Você estava no guia, passo ${indiceDoPassoV1(stepAtual)} de ${TOTAL_PASSOS}. Quer continuar de onde parou ou recomeçar?`, [
      { id: GUIDE_V1_CONTROL_IDS.resume, title: "Continuar" },
      { id: GUIDE_V1_CONTROL_IDS.restart, title: "Recomeçar" },
      { id: GUIDE_V1_CONTROL_IDS.exit, title: "Sair" },
    ]);
  }
  if (status === "completed") {
    return listReply("Você já fez o guia rápido antes. Quer fazer de novo?", [
      { id: GUIDE_V1_CONTROL_IDS.start, title: "Fazer de novo" },
      { id: GUIDE_V1_CONTROL_IDS.exit, title: "Agora não" },
    ]);
  }
  return listReply("Quer fazer o guia rápido (5 passos, menos de 2 minutos)?", [
    { id: GUIDE_V1_CONTROL_IDS.start, title: "Fazer agora" },
    { id: GUIDE_V1_CONTROL_IDS.exit, title: "Agora não" },
  ]);
}

/** Lembrete curto enviado depois de uma resposta livre da IA durante o guia — nunca perde o passo atual (seção 8). */
export function buildGuideRetomarNudgeV1(stepAtual: GuideStepV1): GuideReplyV1 {
  return listReply(`Quer continuar o guia? Você está no passo ${indiceDoPassoV1(stepAtual)} de ${TOTAL_PASSOS}.`, [
    { id: GUIDE_V1_CONTROL_IDS.resume, title: "Continuar guia" },
    { id: GUIDE_V1_CONTROL_IDS.exit, title: "Sair do guia" },
  ]);
}

export interface GuideTransitionResultV1 {
  nextStatus: GuideStatus;
  nextStep: GuideStepV1 | null;
  reply: GuideReplyV1;
}

/**
 * Aplica um controle reconhecido (ver `interpretarControleGuiaV1`) ao passo
 * atual e devolve o próximo estado — pura, sem I/O; quem chama persiste
 * `nextStatus`/`nextStep` e envia `reply`. `currentStep` é a ÚLTIMA posição
 * conhecida (pode ser não-nula mesmo com status `dismissed`/`not_started`,
 * ver `buildGuideReabrirV1`).
 */
export function processGuideControlV1(control: GuideControlV1, currentStep: GuideStepV1 | null, ctx: GuideContextV1): GuideTransitionResultV1 {
  switch (control) {
    case "start":
    case "restart": {
      const primeiro: GuideStepV1 = "veiculo";
      return { nextStatus: "in_progress", nextStep: primeiro, reply: buildGuideStepReplyV1(primeiro, ctx) };
    }
    case "resume": {
      const alvo = currentStep ?? "veiculo";
      return { nextStatus: "in_progress", nextStep: alvo, reply: buildGuideStepReplyV1(alvo, ctx) };
    }
    case "later":
      return { nextStatus: "not_started", nextStep: currentStep, reply: { kind: "text", text: 'Sem problema! Quando quiser, é só escrever "primeiros passos".' } };
    case "noThanks":
      return {
        nextStatus: "dismissed",
        nextStep: null,
        reply: { kind: "text", text: 'Combinado, não vou te interromper com isso. Se mudar de ideia, é só escrever "primeiros passos".' },
      };
    case "exit":
      return {
        nextStatus: "dismissed",
        nextStep: currentStep,
        reply: {
          kind: "text",
          text: currentStep
            ? `Guia pausado no passo ${indiceDoPassoV1(currentStep)} de ${TOTAL_PASSOS}. Quando quiser continuar, escreva "primeiros passos".`
            : 'Sem problema! Quando quiser, é só escrever "primeiros passos".',
        },
      };
    case "next": {
      const atual = currentStep ?? "veiculo";
      const proximo = proximoPassoV1(atual);
      if (!proximo || proximo === "final") {
        return { nextStatus: "completed", nextStep: null, reply: buildGuideStepReplyV1("final", ctx) };
      }
      return { nextStatus: "in_progress", nextStep: proximo, reply: buildGuideStepReplyV1(proximo, ctx) };
    }
  }
}
