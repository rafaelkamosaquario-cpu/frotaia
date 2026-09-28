import { describe, expect, it } from "vitest";
import { APRESENTACAO_V1, SUGESTOES_V1, ajudaConversacionalV1, resolverSugestaoV1, COMPORTAMENTO_WHATSAPP_V1 } from "./conversationExperience";
import { processOnboardingMessage } from "./onboardingConversation";
describe("experiência V1", () => {
  it("apresenta valor e mídia antes do plano, sem preço novo", () => {
    expect(APRESENTACAO_V1).toContain("antes de escolher um plano");
    expect(APRESENTACAO_V1).toContain("áudio, foto ou documento");
    expect(APRESENTACAO_V1).not.toContain("R$");
    expect(ajudaConversacionalV1()).toContain("fontes disponíveis");
  });
  it("menu compacto, sem apagar catálogo legado", () => {
    expect(SUGESTOES_V1).toHaveLength(5); expect(resolverSugestaoV1("2")?.id).toBe("v1_manutencao");
    expect(resolverSugestaoV1("6")).toBeUndefined(); expect(COMPORTAMENTO_WHATSAPP_V1).toContain("somente após sucesso");
  });
  it("aproveita placa, carroceria, configuração e consumo explícitos e confirma antes de finalizar", () => {
    const r = processOnboardingMessage("awaiting_primary_vehicle", { companyId: "empresa", name: "João" }, "Atego 2426 2018, ABC1D23, truck, baú, 3 km/l");
    expect(r.finalize).toBe(false); expect(r.collectedData).toMatchObject({ plate: "ABC1D23", averageConsumptionKmL: 3, bodyType: "bau", pendingCombinedConfirmation: true });
    const final = processOnboardingMessage(r.nextState, r.collectedData, "sim"); expect(final.finalize).toBe(true); expect(final.collectedData.companyId).toBe("empresa");
  });
  it("permite corrigir resumo sem apagar identidade da empresa", () => {
    const r = processOnboardingMessage("awaiting_consumption", { companyId: "empresa", name: "João", pendingCombinedConfirmation: true, plate: "ABC1D23" }, "corrigir");
    expect(r.nextState).toBe("awaiting_primary_vehicle"); expect(r.collectedData.companyId).toBe("empresa"); expect(r.collectedData.plate).toBeUndefined();
  });
  it("não confunde ano com consumo", () => {
    const r = processOnboardingMessage("awaiting_primary_vehicle", {}, "Atego 2426 2018");
    expect(r.collectedData.averageConsumptionKmL).toBeUndefined(); expect(r.nextState).toBe("awaiting_plate");
  });
});
