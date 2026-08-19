import { describe, expect, it } from "vitest";
import { calcularMatch, MATCH_LIMIAR_FORTE, MATCH_LIMIAR_MINIMO } from "./matching";
import type { FreightOpportunityRow, FreightRadarRow } from "@/lib/supabase/tables";

function fakeRadar(overrides: Partial<FreightRadarRow> = {}): FreightRadarRow {
  return {
    id: "radar-1",
    company_id: "empresa-1",
    user_id: "user-1",
    vehicle_id: null,
    origin_city: "Goiânia",
    origin_state: "GO",
    destination_city: "Curitiba",
    destination_state: "PR",
    destination_region_label: null,
    available_from: null,
    available_until: null,
    status: "active",
    notes: null,
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
    ...overrides,
  } as FreightRadarRow;
}

function fakeOpportunity(overrides: Partial<FreightOpportunityRow> = {}): FreightOpportunityRow {
  return {
    id: "oportunidade-1",
    source: "whatsapp_group",
    source_group_id: "grupo-1",
    source_group_name: "Grupo Fretes",
    original_message_id: "msg-1",
    original_text: "Carga Goiânia x Curitiba, sider, 28t, R$8.500.",
    origin_city: "Goiânia",
    origin_state: "GO",
    destination_city: "Curitiba",
    destination_state: "PR",
    pickup_date: null,
    body_type: "sider",
    weight_kg: 28000,
    freight_value_cents: 850000,
    contact_text: null,
    extraction_confidence: {},
    status: "new",
    captured_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 172800000).toISOString(),
    raw_payload: null,
    created_at: new Date().toISOString(),
    ...overrides,
  } as FreightOpportunityRow;
}

describe("calcularMatch", () => {
  it("dá FORTE quando origem, destino, carroceria e data batem tudo", () => {
    const resultado = calcularMatch(fakeRadar(), fakeOpportunity(), "sider");
    expect(resultado.nivel).toBe("FORTE");
    expect(resultado.score).toBeGreaterThanOrEqual(MATCH_LIMIAR_FORTE);
  });

  it("é SEM_MATCH quando a UF de origem diverge (gate eliminatório)", () => {
    const resultado = calcularMatch(fakeRadar({ origin_state: "SP" }), fakeOpportunity({ origin_state: "GO" }), "sider");
    expect(resultado.nivel).toBe("SEM_MATCH");
    expect(resultado.score).toBe(0);
  });

  it("é SEM_MATCH quando a UF de destino diverge (gate eliminatório)", () => {
    const resultado = calcularMatch(fakeRadar({ destination_state: "SC" }), fakeOpportunity({ destination_state: "PR" }), "sider");
    expect(resultado.nivel).toBe("SEM_MATCH");
  });

  it("nunca rejeita por carroceria divergente — só reduz o score (etapa 23 da spec)", () => {
    const comCarroceriaIgual = calcularMatch(fakeRadar(), fakeOpportunity({ body_type: "sider" }), "sider");
    const comCarroceriaDiferente = calcularMatch(fakeRadar(), fakeOpportunity({ body_type: "graneleiro" }), "sider");
    expect(comCarroceriaDiferente.nivel).not.toBe("SEM_MATCH");
    expect(comCarroceriaDiferente.score).toBeLessThan(comCarroceriaIgual.score);
  });

  it("trata carroceria ausente como 'não confirmado', nunca como rejeição", () => {
    const resultado = calcularMatch(fakeRadar(), fakeOpportunity({ body_type: null }), null);
    expect(resultado.nivel).not.toBe("SEM_MATCH");
  });

  it("radar sem destino fixo aceita qualquer destino da oportunidade", () => {
    const resultado = calcularMatch(fakeRadar({ destination_state: null, destination_city: null }), fakeOpportunity({ destination_state: "SC" }), "sider");
    expect(resultado.nivel).not.toBe("SEM_MATCH");
  });

  it("data dentro da janela do radar soma pontos; fora da janela não", () => {
    const radarComJanela = fakeRadar({ available_from: "2026-08-01", available_until: "2026-08-31" });
    const dentro = calcularMatch(radarComJanela, fakeOpportunity({ pickup_date: "2026-08-15" }), "sider");
    const fora = calcularMatch(radarComJanela, fakeOpportunity({ pickup_date: "2026-09-15" }), "sider");
    expect(dentro.score).toBeGreaterThan(fora.score);
  });

  it("sem nenhum gate de UF violado, o score nunca cai abaixo do limiar mínimo (piso é sempre PARCIAL ou melhor)", () => {
    const radar = fakeRadar();
    const oportunidade = fakeOpportunity({ origin_state: null, destination_state: null, body_type: null, pickup_date: null });
    const resultado = calcularMatch(radar, oportunidade, null);
    expect(resultado.score).toBeGreaterThanOrEqual(MATCH_LIMIAR_MINIMO);
    expect(resultado.nivel).not.toBe("SEM_MATCH");
  });
});
