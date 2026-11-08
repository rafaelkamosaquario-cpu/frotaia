import { describe, expect, it } from "vitest";
import { nextVehicleConfiguration as setup } from "./vehicleSetup";
import { processOnboardingMessage as step, type OnboardingCollectedData } from "./onboardingConversation";

describe("cadastro de veículo sem confundir caminhão e composição", () => {
  it.each(["4x2", "4 por 2", "4×2"])("preserva %s mas pergunta o tipo", input => {
    const r = setup({}, input);
    expect(r.data.formula).toBe("4x2"); expect(r.data.kind).toBeUndefined(); expect(r.data.complete).not.toBe(true);
    const typed = setup(r.data, "cavalo mecânico");
    expect(typed.data.motorAxles).toBe(2); expect(typed.data.complete).not.toBe(true);
  });
  it.each(["4x2", "6x2", "6x4", "8x4"])("usa catálogo para rígido %s", formula => {
    const r = setup({}, `caminhão rígido ${formula} sem implemento`);
    expect(r.data).toMatchObject({ complete: true, configurationId: `caminhao-${formula}`, totalAxles: Number(formula[0]) / 2, attached: false });
  });
  it("não confunde cavalo toco com rígido", () => {
    expect(setup({}, "cavalo toco 4x2 sem carreta").data.kind).toBe("cavalo");
  });
  it("soma cavalo 4x2 e carreta de quatro eixos sem presumir sete", () => {
    const r = setup({}, "cavalo mecânico 4x2 carreta 4 eixos");
    expect(r.data).toMatchObject({ complete: true, motorAxles: 2, implementAxles: 4, totalAxles: 6 });
  });
  it("guarda separadamente caminhão 6x4 e Julieta", () => {
    const r = setup({}, "caminhão rígido 6x4 Julieta 3 eixos");
    expect(r.data).toMatchObject({ complete: true, motorAxles: 3, implement: "julieta", implementAxles: 3, totalAxles: 6 });
  });
  it("bitrem não implica quantidade fixa de eixos", () => {
    const r = setup({}, "cavalo 6x4 bitrem");
    expect(r.data.complete).not.toBe(true);
    expect(setup(r.data, "6 eixos").data.totalAxles).toBe(9);
  });
  it("não inventa configuração após respostas desconhecidas", () => {
    let data = setup({}, "não sei").data;
    for (let i = 0; i < 4; i++) data = setup(data, "não sei").data;
    expect(data.complete).not.toBe(true); expect(data.kind).toBeUndefined();
    expect(setup({}, "cavalo 10x6 sem carreta").data.complete).not.toBe(true);
  });
});

describe("novo fluxo WhatsApp", () => {
  it("cidade segue direto para caminhão", () => {
    const r = step("awaiting_base_location", {}, "Curitiba - PR");
    expect(r.nextState).toBe("awaiting_primary_vehicle");
    expect(r.collectedData).toMatchObject({ baseCity: "Curitiba", baseState: "PR" });
    expect(r.reply.text).toContain("Vamos cadastrar seu caminhão");
  });
  it.each(["awaiting_region", "awaiting_fixed_route", "awaiting_primary_route"] as const)("retoma %s sem perder dados antigos", state => {
    const r = step(state, { region: "Sul", companyId: "existente" }, "sim");
    expect(r.nextState).toBe("awaiting_primary_vehicle");
    expect(r.collectedData).toMatchObject({ region: "Sul", companyId: "existente" });
  });
  it.each(["depois", "não sei", "123", ""])("placa inválida %s não avança", input => {
    expect(step("awaiting_plate", {}, input).nextState).toBe("awaiting_plate");
  });
  it.each(["ABC1D23", "abc-1234"])("aceita placa %s", input => {
    expect(step("awaiting_plate", {}, input).nextState).toBe("awaiting_vehicle_configuration");
  });
  it("percorre cadastro completo e exige confirmação final", () => {
    let r = step("awaiting_primary_vehicle", { companyId: "existente" }, "Iveco Stralis 400 2015");
    for (const answer of ["ABC1D23", "4x2", "caminhão rígido", "não", "baú", "2,5 km/l"]) r = step(r.nextState, r.collectedData, answer);
    expect(r.finalize).toBe(false); expect(r.collectedData.pendingCombinedConfirmation).toBe(true);
    expect(r.reply.text).toContain("sem implemento engatado");
    r = step(r.nextState, r.collectedData, "sim");
    expect(r.finalize).toBe(true);
    expect(r.collectedData).toMatchObject({ companyId: "existente", plate: "ABC1D23", axleCount: 2, averageConsumptionKmL: 2.5 });
  });
  it("correção apaga configuração mas preserva identidade", () => {
    const r = step("awaiting_consumption", { companyId: "existente", pendingCombinedConfirmation: true, vehicleSetup: setup({}, "cavalo 6x4 carreta 3 eixos").data }, "corrigir");
    expect(r.collectedData.vehicleSetup).toBeUndefined(); expect(r.collectedData.companyId).toBe("existente");
  });
  it("pausa e retoma sem voltar à região", () => {
    const data: OnboardingCollectedData = { name: "João", companyType: "autonomo", intentId: "fretes", baseCity: "Curitiba" };
    const paused = step("awaiting_primary_vehicle", data, "pausar");
    expect(paused.nextState).toBe("paused");
    expect(step("paused", paused.collectedData, "continuar").nextState).toBe("awaiting_primary_vehicle");
  });
  it("confirmação antiga sem placa não finaliza", () => {
    expect(step("awaiting_consumption", { pendingCombinedConfirmation: true }, "sim").nextState).toBe("awaiting_plate");
  });
});
