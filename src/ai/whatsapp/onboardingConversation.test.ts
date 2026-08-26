import { describe, it, expect } from "vitest";
import { firstOnboardingMessage, processOnboardingMessage, type OnboardingCollectedData } from "./onboardingConversation";

/**
 * Cobre a etapa nova "o que você quer resolver primeiro" (awaiting_intent,
 * 07/08/2026) — não é uma suíte completa de todo o onboarding, só a parte
 * adicionada nesta rodada + os pontos de integração que ela toca
 * (awaiting_profile agora leva pra awaiting_intent, e a retomada de
 * "paused" precisa passar por lá também).
 */

describe("firstOnboardingMessage", () => {
  it("explica o valor do produto antes de pedir o nome", () => {
    const texto = firstOnboardingMessage();
    expect(texto).toContain("Como posso chamar você?");
    expect(texto.toLowerCase()).toContain("frete");
    expect(texto.toLowerCase()).toContain("radar de fretes");
  });
});

describe("awaiting_profile → awaiting_intent", () => {
  it("depois de escolher o perfil, a próxima pergunta é a de intenção, não a de cidade", () => {
    const resultado = processOnboardingMessage("awaiting_profile", { name: "Rafael" }, "motorista_autonomo");
    expect(resultado.nextState).toBe("awaiting_intent");
    expect(resultado.reply.kind).toBe("list");
  });
});

describe("awaiting_intent", () => {
  const collectedBase: OnboardingCollectedData = { name: "Rafael", companyType: "autonomo", profileLabel: "motorista autônomo" };

  it("toque numa categoria salva intentId/intentLabel e segue pra cidade, com texto de transição (menciona o Radar de Fretes)", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "fretes");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("fretes");
    expect(resultado.collectedData.intentLabel).toBe("Fretes e oportunidades");
    expect(resultado.reply.kind).toBe("text");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("Radar de Fretes");
      expect(resultado.reply.text).toContain("cidade"); // pergunta de base location concatenada na mesma mensagem
    }
  });

  it("'ver tudo' manda o catálogo completo (todas as categorias) e ainda segue o fluxo normalmente", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "ver_tudo");
    expect(resultado.nextState).toBe("awaiting_base_location");
    expect(resultado.collectedData.intentId).toBe("ver_tudo");
    if (resultado.reply.kind === "text") {
      expect(resultado.reply.text).toContain("Notícias do transporte");
      expect(resultado.reply.text).toContain("Fretes e oportunidades");
    }
  });

  it("aceita o título digitado por extenso, não só o id da lista", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "Manutenção e pneus");
    expect(resultado.collectedData.intentId).toBe("pneus_manutencao");
  });

  it("texto não reconhecido repete a mesma pergunta, sem avançar de estado", () => {
    const resultado = processOnboardingMessage("awaiting_intent", collectedBase, "blablabla sem sentido");
    expect(resultado.nextState).toBe("awaiting_intent");
    expect(resultado.collectedData.intentId).toBeUndefined();
  });
});

describe("awaiting_base_location → awaiting_region", () => {
  it("cidade válida avança e guarda cidade/UF", () => {
    const resultado = processOnboardingMessage("awaiting_base_location", {}, "Curitiba - PR");
    expect(resultado.nextState).toBe("awaiting_region");
    expect(resultado.collectedData.baseCity).toBe("Curitiba");
    expect(resultado.collectedData.baseState).toBe("PR");
  });
});

describe("awaiting_region → awaiting_fixed_route", () => {
  it("toque na lista avança e guarda a região", () => {
    const resultado = processOnboardingMessage("awaiting_region", {}, "sul");
    expect(resultado.nextState).toBe("awaiting_fixed_route");
    expect(resultado.collectedData.region).toBe("Sul");
  });
});

describe("awaiting_fixed_route — bifurcação nova (rota principal condicional)", () => {
  it('"não" pula direto pra configuração do veículo, sem perguntar rota principal', () => {
    const resultado = processOnboardingMessage("awaiting_fixed_route", {}, "não");
    expect(resultado.nextState).toBe("awaiting_primary_vehicle");
    expect(resultado.collectedData.hasFixedRoute).toBe(false);
  });

  it('"sim" abre a nova etapa de rota principal', () => {
    const resultado = processOnboardingMessage("awaiting_fixed_route", {}, "sim");
    expect(resultado.nextState).toBe("awaiting_primary_route");
    expect(resultado.collectedData.hasFixedRoute).toBe(true);
  });

  it("resposta não reconhecida repete a pergunta", () => {
    const resultado = processOnboardingMessage("awaiting_fixed_route", {}, "talvez");
    expect(resultado.nextState).toBe("awaiting_fixed_route");
  });
});

describe("awaiting_primary_route (nova etapa)", () => {
  it("rota com seta separa origem/destino e sempre guarda o texto bruto", () => {
    const resultado = processOnboardingMessage("awaiting_primary_route", { hasFixedRoute: true }, "Curitiba → São Paulo");
    expect(resultado.nextState).toBe("awaiting_primary_vehicle");
    expect(resultado.collectedData.primaryRouteRaw).toBe("Curitiba → São Paulo");
    expect(resultado.collectedData.primaryRouteOrigin).toBe("Curitiba");
    expect(resultado.collectedData.primaryRouteDestination).toBe("São Paulo");
  });

  it("mais de uma rota: guarda o texto bruto completo, estrutura só a primeira", () => {
    const resultado = processOnboardingMessage(
      "awaiting_primary_route",
      { hasFixedRoute: true },
      "Curitiba → São Paulo e Curitiba → Campinas"
    );
    expect(resultado.collectedData.primaryRouteRaw).toBe("Curitiba → São Paulo e Curitiba → Campinas");
    expect(resultado.collectedData.primaryRouteOrigin).toBe("Curitiba");
    expect(resultado.collectedData.primaryRouteDestination).toBe("São Paulo");
  });

  it("texto sem separador reconhecível: guarda o bruto, não quebra o fluxo", () => {
    const resultado = processOnboardingMessage("awaiting_primary_route", { hasFixedRoute: true }, "faço sempre a mesma rota do sul");
    expect(resultado.nextState).toBe("awaiting_primary_vehicle");
    expect(resultado.collectedData.primaryRouteRaw).toBe("faço sempre a mesma rota do sul");
    expect(resultado.collectedData.primaryRouteOrigin).toBeUndefined();
  });

  it("vazio repete a pergunta", () => {
    const resultado = processOnboardingMessage("awaiting_primary_route", { hasFixedRoute: true }, "");
    expect(resultado.nextState).toBe("awaiting_primary_route");
  });
});

describe("awaiting_primary_vehicle — agora obrigatório (sem \"depois\")", () => {
  it("marca/modelo/ano em texto livre avança pra placa", () => {
    const resultado = processOnboardingMessage("awaiting_primary_vehicle", {}, "Scania R450 2022");
    expect(resultado.nextState).toBe("awaiting_plate");
    expect(resultado.collectedData.primaryVehicleRaw).toBe("Scania R450 2022");
  });

  it('"depois" não é mais aceito como pulo — vira texto normal do veículo', () => {
    const resultado = processOnboardingMessage("awaiting_primary_vehicle", {}, "depois");
    expect(resultado.nextState).toBe("awaiting_plate");
    expect(resultado.collectedData.primaryVehicleRaw).toBe("depois");
  });

  it("vazio repete a pergunta (não avança sem informação nenhuma)", () => {
    const resultado = processOnboardingMessage("awaiting_primary_vehicle", {}, "   ");
    expect(resultado.nextState).toBe("awaiting_primary_vehicle");
    expect(resultado.collectedData.primaryVehicleRaw).toBeUndefined();
  });
});

describe("awaiting_plate (nova etapa, opcional — nunca bloqueia)", () => {
  it("placa em formato Mercosul é reconhecida e normalizada", () => {
    const resultado = processOnboardingMessage("awaiting_plate", {}, "abc1d23");
    expect(resultado.nextState).toBe("awaiting_vehicle_configuration");
    expect(resultado.collectedData.plate).toBe("ABC1D23");
    expect(resultado.collectedData.plateAsked).toBe(true);
  });

  it("placa com hífen/espaço é normalizada antes de validar", () => {
    const resultado = processOnboardingMessage("awaiting_plate", {}, "ABC-1D23");
    expect(resultado.collectedData.plate).toBe("ABC1D23");
  });

  it('"depois" avança sem gravar placa, mas marca a etapa como perguntada', () => {
    const resultado = processOnboardingMessage("awaiting_plate", {}, "depois");
    expect(resultado.nextState).toBe("awaiting_vehicle_configuration");
    expect(resultado.collectedData.plate).toBeUndefined();
    expect(resultado.collectedData.plateAsked).toBe(true);
  });

  it("texto que não é placa também avança (nunca bloqueia)", () => {
    const resultado = processOnboardingMessage("awaiting_plate", {}, "não sei de cabeça");
    expect(resultado.nextState).toBe("awaiting_vehicle_configuration");
    expect(resultado.collectedData.plate).toBeUndefined();
  });
});

describe("awaiting_vehicle_configuration — agora segue pra carroceria, não conclui direto", () => {
  it("tipo rígido resolvido vai pra awaiting_body_type (não mais completed)", () => {
    const resultado = processOnboardingMessage("awaiting_vehicle_configuration", {}, "toco");
    expect(resultado.nextState).toBe("awaiting_body_type");
    expect(resultado.finalize).toBe(false);
    expect(resultado.collectedData.vehicleType).toBe("toco");
  });

  it("cavalo mecânico ainda exige desambiguação de composição antes de prosseguir", () => {
    const resultado = processOnboardingMessage("awaiting_vehicle_configuration", {}, "cavalo mecânico");
    expect(resultado.nextState).toBe("awaiting_vehicle_configuration");
    expect(resultado.collectedData.awaitingVehicleConfigChoice).toBe(true);
    expect(resultado.reply.kind).toBe("list");
  });

  it("escolhida a composição, segue pra awaiting_body_type", () => {
    const resultado = processOnboardingMessage(
      "awaiting_vehicle_configuration",
      { awaitingVehicleConfigChoice: true },
      "cavalo_trucado_carreta"
    );
    expect(resultado.nextState).toBe("awaiting_body_type");
    expect(resultado.collectedData.vehicleType).toBe("cavalo_mecanico");
    expect(resultado.collectedData.axleCount).toBe(6);
  });
});

describe("awaiting_vehicle_configuration — nunca trava em loop infinito (correção 08/2026)", () => {
  it('tocar a própria opção "Outro / não sei" da lista resolve na hora, nunca repete', () => {
    const resultado = processOnboardingMessage("awaiting_vehicle_configuration", {}, "outro");
    expect(resultado.nextState).toBe("awaiting_body_type");
    expect(resultado.collectedData.vehicleType).toBe("outro");
    expect(resultado.collectedData.axleCount).toBeNull();
  });

  it('texto livre "não sei" também resolve como "outro", sem repetir a pergunta', () => {
    const resultado = processOnboardingMessage("awaiting_vehicle_configuration", {}, "não sei");
    expect(resultado.nextState).toBe("awaiting_body_type");
    expect(resultado.collectedData.vehicleType).toBe("outro");
  });

  it("resposta não reconhecida soma tentativa e continua pedindo (1ª e 2ª vez)", () => {
    const r1 = processOnboardingMessage("awaiting_vehicle_configuration", {}, "blablabla sem sentido");
    expect(r1.nextState).toBe("awaiting_vehicle_configuration");
    expect(r1.collectedData.vehicleConfigAttempts).toBe(1);

    const r2 = processOnboardingMessage("awaiting_vehicle_configuration", r1.collectedData, "outra coisa qualquer");
    expect(r2.nextState).toBe("awaiting_vehicle_configuration");
    expect(r2.collectedData.vehicleConfigAttempts).toBe(2);
  });

  it("na 3ª resposta não reconhecida seguida, força vehicleType=outro e SEMPRE avança — nunca fica preso pra sempre", () => {
    const r1 = processOnboardingMessage("awaiting_vehicle_configuration", {}, "xyz");
    const r2 = processOnboardingMessage("awaiting_vehicle_configuration", r1.collectedData, "abc");
    const r3 = processOnboardingMessage("awaiting_vehicle_configuration", r2.collectedData, "123");

    expect(r3.nextState).toBe("awaiting_body_type");
    expect(r3.collectedData.vehicleType).toBe("outro");
    expect(r3.collectedData.axleCount).toBeNull();
    expect(r3.collectedData.vehicleConfigAttempts).toBe(0);
  });

  it("contador zera ao resolver com sucesso (não fica manchando etapas futuras)", () => {
    const r1 = processOnboardingMessage("awaiting_vehicle_configuration", {}, "resposta ruim");
    const r2 = processOnboardingMessage("awaiting_vehicle_configuration", r1.collectedData, "toco");
    expect(r2.nextState).toBe("awaiting_body_type");
    expect(r2.collectedData.vehicleConfigAttempts).toBe(0);
  });

  it('desambiguação (cavalo/carreta) também reconhece "não sei" e resolve sem travar', () => {
    const resultado = processOnboardingMessage(
      "awaiting_vehicle_configuration",
      { awaitingVehicleConfigChoice: true },
      "não sei"
    );
    expect(resultado.nextState).toBe("awaiting_body_type");
    expect(resultado.collectedData.vehicleType).toBe("cavalo_mecanico");
    expect(resultado.collectedData.axleCount).toBeNull();
  });

  it("desambiguação com escolha inválida repetida 3x força avanço (nunca trava)", () => {
    const r1 = processOnboardingMessage("awaiting_vehicle_configuration", { awaitingVehicleConfigChoice: true }, "invalido");
    const r2 = processOnboardingMessage("awaiting_vehicle_configuration", r1.collectedData, "tambem invalido");
    const r3 = processOnboardingMessage("awaiting_vehicle_configuration", r2.collectedData, "ainda invalido");

    expect(r3.nextState).toBe("awaiting_body_type");
    expect(r3.collectedData.vehicleType).toBe("cavalo_mecanico");
    expect(r3.collectedData.axleCount).toBeNull();
    expect(r3.collectedData.awaitingVehicleConfigChoice).toBe(false);
  });
});

describe("awaiting_body_type (nova etapa — nunca bloqueia, sempre resolve)", () => {
  it("carroceria reconhecida por palavra-chave avança pra consumo", () => {
    const resultado = processOnboardingMessage("awaiting_body_type", {}, "uso sider");
    expect(resultado.nextState).toBe("awaiting_consumption");
    expect(resultado.collectedData.bodyType).toBe("sider");
  });

  it("baú/caçamba/frigorífico são reconhecidos", () => {
    expect(processOnboardingMessage("awaiting_body_type", {}, "baú").collectedData.bodyType).toBe("bau");
    expect(processOnboardingMessage("awaiting_body_type", {}, "caçamba").collectedData.bodyType).toBe("cacamba");
    expect(processOnboardingMessage("awaiting_body_type", {}, "frigorífico").collectedData.bodyType).toBe("frigorifico");
  });

  it("texto não reconhecido cai em \"outro\" e ainda assim avança (nunca repete)", () => {
    const resultado = processOnboardingMessage("awaiting_body_type", {}, "sei lá, não tenho certeza");
    expect(resultado.nextState).toBe("awaiting_consumption");
    expect(resultado.collectedData.bodyType).toBe("outro");
  });
});

describe("awaiting_consumption (nova etapa, opcional — sempre finaliza)", () => {
  it("aceita vírgula decimal", () => {
    const resultado = processOnboardingMessage("awaiting_consumption", {}, "2,8");
    expect(resultado.nextState).toBe("completed");
    expect(resultado.finalize).toBe(true);
    expect(resultado.collectedData.averageConsumptionKmL).toBe(2.8);
  });

  it("aceita ponto decimal com unidade junto", () => {
    const resultado = processOnboardingMessage("awaiting_consumption", {}, "2.8 km/l");
    expect(resultado.collectedData.averageConsumptionKmL).toBe(2.8);
  });

  it('"não sei" finaliza mesmo sem número', () => {
    const resultado = processOnboardingMessage("awaiting_consumption", {}, "não sei");
    expect(resultado.nextState).toBe("completed");
    expect(resultado.finalize).toBe(true);
    expect(resultado.collectedData.averageConsumptionKmL).toBeUndefined();
    expect(resultado.collectedData.consumptionAsked).toBe(true);
  });
});

describe("cancelar a partir de uma etapa nova", () => {
  it("cancelar durante awaiting_plate pausa o onboarding normalmente", () => {
    const resultado = processOnboardingMessage("awaiting_plate", { name: "Rafael" }, "cancelar");
    expect(resultado.nextState).toBe("paused");
  });
});

describe("retomada de 'paused' — cobre a ordem completa das novas etapas", () => {
  it("sem intentId ainda, retoma pra awaiting_intent (não pula direto pra cidade)", () => {
    const resultado = processOnboardingMessage("paused", { name: "Rafael", companyType: "autonomo" }, "oi de novo");
    expect(resultado.nextState).toBe("awaiting_intent");
  });

  it("com intentId já preenchido, retoma pra awaiting_base_location", () => {
    const resultado = processOnboardingMessage(
      "paused",
      { name: "Rafael", companyType: "autonomo", intentId: "fretes", intentLabel: "Fretes e oportunidades" },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_base_location");
  });

  it("hasFixedRoute=true sem rota ainda: retoma pra awaiting_primary_route", () => {
    const resultado = processOnboardingMessage(
      "paused",
      { name: "Rafael", companyType: "autonomo", intentId: "fretes", baseCity: "Curitiba", region: "Sul", hasFixedRoute: true },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_primary_route");
  });

  it("hasFixedRoute=false: retoma direto pra awaiting_primary_vehicle, sem pedir rota", () => {
    const resultado = processOnboardingMessage(
      "paused",
      { name: "Rafael", companyType: "autonomo", intentId: "fretes", baseCity: "Curitiba", region: "Sul", hasFixedRoute: false },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_primary_vehicle");
  });

  it("veículo/placa preenchidos: retoma pra awaiting_vehicle_configuration", () => {
    const resultado = processOnboardingMessage(
      "paused",
      {
        name: "Rafael",
        companyType: "autonomo",
        intentId: "fretes",
        baseCity: "Curitiba",
        region: "Sul",
        hasFixedRoute: false,
        primaryVehicleRaw: "Scania R450",
        plateAsked: true,
      },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_vehicle_configuration");
  });

  it("configuração resolvida, sem carroceria: retoma pra awaiting_body_type", () => {
    const resultado = processOnboardingMessage(
      "paused",
      {
        name: "Rafael",
        companyType: "autonomo",
        intentId: "fretes",
        baseCity: "Curitiba",
        region: "Sul",
        hasFixedRoute: false,
        primaryVehicleRaw: "Scania R450",
        plateAsked: true,
        vehicleType: "toco",
        axleCount: 2,
      },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_body_type");
  });

  it("tudo preenchido até carroceria: retoma pra awaiting_consumption (última etapa)", () => {
    const resultado = processOnboardingMessage(
      "paused",
      {
        name: "Rafael",
        companyType: "autonomo",
        intentId: "fretes",
        baseCity: "Curitiba",
        region: "Sul",
        hasFixedRoute: false,
        primaryVehicleRaw: "Scania R450",
        plateAsked: true,
        vehicleType: "toco",
        axleCount: 2,
        bodyType: "sider",
      },
      "oi de novo"
    );
    expect(resultado.nextState).toBe("awaiting_consumption");
  });
});
