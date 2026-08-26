import { describe, it, expect } from "vitest";
import {
  interpretarControleGuiaV1,
  buildGuideOfferV1,
  buildGuideStepReplyV1,
  buildGuideReabrirV1,
  buildGuideRetomarNudgeV1,
  processGuideControlV1,
  proximoPassoV1,
  indiceDoPassoV1,
  GUIDE_V1_STEPS,
  GUIDE_V1_CONTROL_IDS,
  type GuideStepV1,
} from "./guideConversationV1";

/**
 * Guia de Primeiros Passos V1 (08/2026) — máquina de estados determinística,
 * sem I/O. Cobertura equivalente aos cenários 4-20 da spec original (o
 * dispatch dentro do webhook, cenários 1-3/17/18/20, tem sua própria
 * cobertura em route.test.ts).
 */

describe("interpretarControleGuiaV1", () => {
  it("reconhece o id exato do controle (toque na lista)", () => {
    expect(interpretarControleGuiaV1(GUIDE_V1_CONTROL_IDS.next)).toBe("next");
    expect(interpretarControleGuiaV1(GUIDE_V1_CONTROL_IDS.start)).toBe("start");
  });

  it("reconhece sinônimos digitados (fallback de texto)", () => {
    expect(interpretarControleGuiaV1("fazer agora")).toBe("start");
    expect(interpretarControleGuiaV1("Próximo")).toBe("next");
    expect(interpretarControleGuiaV1("pular")).toBe("next");
    expect(interpretarControleGuiaV1("sair do guia")).toBe("exit");
    expect(interpretarControleGuiaV1("não preciso")).toBe("noThanks");
    expect(interpretarControleGuiaV1("depois")).toBe("later");
    expect(interpretarControleGuiaV1("recomeçar")).toBe("restart");
    expect(interpretarControleGuiaV1("retomar")).toBe("resume");
  });

  it("mensagem longa (conteúdo real, não controle de UI) nunca é interpretada como comando", () => {
    expect(interpretarControleGuiaV1("Curitiba para São Paulo por R$ 5.200, esse frete compensa considerando o consumo do meu caminhão?")).toBeNull();
  });

  it("texto vazio/ausente devolve null", () => {
    expect(interpretarControleGuiaV1(undefined)).toBeNull();
    expect(interpretarControleGuiaV1("")).toBeNull();
  });
});

describe("buildGuideOfferV1", () => {
  it("oferece as 3 opções obrigatórias: fazer agora, depois, não preciso", () => {
    const oferta = buildGuideOfferV1();
    expect(oferta.kind).toBe("list");
    if (oferta.kind === "list") {
      expect(oferta.options.map((o) => o.id)).toEqual([GUIDE_V1_CONTROL_IDS.start, GUIDE_V1_CONTROL_IDS.later, GUIDE_V1_CONTROL_IDS.noThanks]);
    }
  });
});

describe("processGuideControlV1 — 4. Fazer agora", () => {
  it("inicia no passo 'veiculo', status in_progress", () => {
    const r = processGuideControlV1("start", null, {});
    expect(r.nextStatus).toBe("in_progress");
    expect(r.nextStep).toBe("veiculo");
  });

  it("mostra dado real do veículo quando disponível, sem despejar ficha completa", () => {
    const r = processGuideControlV1("start", null, { vehicle: { label: "Scania R450 2022", consumo: "2.8 km/l" } });
    expect(r.reply.kind).toBe("list");
    if (r.reply.kind === "list") {
      expect(r.reply.text).toContain("Scania R450 2022");
      expect(r.reply.text).toContain("2.8 km/l");
    }
  });
});

describe("processGuideControlV1 — 5. Depois", () => {
  it("mantém not_started (não dispensa, só adia) e preserva step atual se houver", () => {
    const r = processGuideControlV1("later", "frete", {});
    expect(r.nextStatus).toBe("not_started");
    expect(r.nextStep).toBe("frete");
    expect(r.reply.kind).toBe("text");
  });
});

describe("processGuideControlV1 — 6. Não preciso", () => {
  it("dispensa (dismissed) e limpa o step — não é retomável, só reiniciável", () => {
    const r = processGuideControlV1("noThanks", "veiculo", {});
    expect(r.nextStatus).toBe("dismissed");
    expect(r.nextStep).toBeNull();
  });
});

describe("processGuideControlV1 — 7. Avançar etapa", () => {
  it("veiculo → frete → custos → registro → radar, sempre in_progress", () => {
    let step: GuideStepV1 = GUIDE_V1_STEPS[0];
    for (let i = 1; i < GUIDE_V1_STEPS.length - 1; i++) {
      const r = processGuideControlV1("next", step, {});
      expect(r.nextStatus).toBe("in_progress");
      expect(r.nextStep).toBe(GUIDE_V1_STEPS[i]);
      step = r.nextStep!;
    }
  });
});

describe("processGuideControlV1 — 8. Pular (sinônimo de avançar, mesma ação)", () => {
  it("'pular' reconhece como controle next e avança o passo", () => {
    expect(interpretarControleGuiaV1("pular")).toBe("next");
    const r = processGuideControlV1("next", "custos", {});
    expect(r.nextStep).toBe("registro");
  });
});

describe("processGuideControlV1 — 9. Sair", () => {
  it("marca dismissed mas PRESERVA o step (diferente de 'não preciso') — permite retomar depois", () => {
    const r = processGuideControlV1("exit", "custos", {});
    expect(r.nextStatus).toBe("dismissed");
    expect(r.nextStep).toBe("custos");
    expect(r.reply.kind).toBe("text");
  });
});

describe("buildGuideReabrirV1 — 10. Retomar / 12. Reiniciar manualmente", () => {
  it("com step salvo (saiu no meio): oferece continuar ou recomeçar, não importa o status exato", () => {
    const reply = buildGuideReabrirV1("dismissed", "custos");
    expect(reply.kind).toBe("list");
    if (reply.kind === "list") {
      expect(reply.options.map((o) => o.id)).toEqual([GUIDE_V1_CONTROL_IDS.resume, GUIDE_V1_CONTROL_IDS.restart, GUIDE_V1_CONTROL_IDS.exit]);
    }
  });

  it("sem step salvo e status completed: oferece 'fazer de novo' (reinício manual explícito)", () => {
    const reply = buildGuideReabrirV1("completed", null);
    expect(reply.kind).toBe("list");
    if (reply.kind === "list") expect(reply.options.map((o) => o.id)).toContain(GUIDE_V1_CONTROL_IDS.start);
  });

  it("sem step salvo, nunca iniciado: oferece 'fazer agora'", () => {
    const reply = buildGuideReabrirV1("not_started", null);
    expect(reply.kind).toBe("list");
    if (reply.kind === "list") expect(reply.options.map((o) => o.id)).toContain(GUIDE_V1_CONTROL_IDS.start);
  });

  it("resume retoma exatamente no step salvo, sem voltar ao início", () => {
    const r = processGuideControlV1("resume", "radar", {});
    expect(r.nextStatus).toBe("in_progress");
    expect(r.nextStep).toBe("radar");
  });

  it("restart sempre volta pro passo 1, mesmo com step salvo avançado", () => {
    const r = processGuideControlV1("restart", "radar", {});
    expect(r.nextStep).toBe("veiculo");
  });
});

describe("processGuideControlV1 — 11. Concluir", () => {
  it("avançar a partir do último passo de conteúdo (radar) conclui: status completed, step null", () => {
    const r = processGuideControlV1("next", "radar", {});
    expect(r.nextStatus).toBe("completed");
    expect(r.nextStep).toBeNull();
    expect(r.reply.kind).toBe("text");
    if (r.reply.kind === "text") expect(r.reply.text).toContain("essencial");
  });
});

describe("buildGuideRetomarNudgeV1 — 13/14. Pergunta paralela à IA não perde o passo", () => {
  it("lembrete cita o passo certo, nunca reinicia nem avança", () => {
    const nudge = buildGuideRetomarNudgeV1("custos");
    expect(nudge.kind).toBe("list");
    if (nudge.kind === "list") expect(nudge.text).toContain(`${indiceDoPassoV1("custos")} de ${GUIDE_V1_STEPS.length}`);
  });
});

describe("proximoPassoV1 / indiceDoPassoV1", () => {
  it("devolve null depois do último passo", () => {
    expect(proximoPassoV1("final")).toBeNull();
  });

  it("índice 1-based, coerente com o texto de progresso mostrado ao cliente", () => {
    expect(indiceDoPassoV1("veiculo")).toBe(1);
    expect(indiceDoPassoV1("final")).toBe(GUIDE_V1_STEPS.length);
  });
});

describe("Personalização por intenção (seção 7) — mesma sequência, texto adaptado", () => {
  it("intentId=fretes destaca o passo 'frete' sem pular nem reordenar passos", () => {
    const comIntencao = buildGuideStepReplyV1("frete", { intentId: "fretes" });
    const semIntencao = buildGuideStepReplyV1("frete", {});
    expect(comIntencao.kind).toBe("list");
    expect(semIntencao.kind).toBe("list");
    if (comIntencao.kind === "list" && semIntencao.kind === "list") {
      expect(comIntencao.text).not.toBe(semIntencao.text);
      expect(comIntencao.text.toLowerCase()).toContain("especialmente pra você");
    }
  });

  it("intentId sem destaque configurado pro passo não altera o texto", () => {
    const r = buildGuideStepReplyV1("veiculo", { intentId: "noticias" });
    expect(r.kind).toBe("list");
    if (r.kind === "list") expect(r.text.toLowerCase()).not.toContain("especialmente pra você");
  });
});
