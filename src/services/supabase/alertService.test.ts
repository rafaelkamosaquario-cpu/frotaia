import { describe, it, expect } from "vitest";
import { resolveAlertOrigin, isEditableAlert } from "./alertService";

/**
 * Alertas — evolução funcional 08/2026 (Rodada 2). `category` é texto livre
 * sem enum/check no banco — resolveAlertOrigin nunca confia nele sozinho
 * (só como heurística pra checklist, que não tem FK própria). Regressão da
 * regra "não duplicar/confundir alerta automático com manual".
 */

function alerta(overrides: Partial<{ maintenance_schedule_id: string | null; vehicle_document_id: string | null; category: string | null }>) {
  return { maintenance_schedule_id: null, vehicle_document_id: null, category: null, ...overrides };
}

describe("resolveAlertOrigin", () => {
  it("manutenção vence sobre qualquer category (FK sempre manda)", () => {
    expect(resolveAlertOrigin(alerta({ maintenance_schedule_id: "m1", category: "outra-coisa" }))).toBe("manutencao");
  });

  it("documento vence sobre category quando não há manutenção", () => {
    expect(resolveAlertOrigin(alerta({ vehicle_document_id: "d1" }))).toBe("documento");
  });

  it("checklist só é identificado pela convenção de category, sem FK própria", () => {
    expect(resolveAlertOrigin(alerta({ category: "checklist" }))).toBe("checklist");
  });

  it("sem FK e sem category='checklist' é sempre manual — mesmo com category livre ou vazia", () => {
    expect(resolveAlertOrigin(alerta({}))).toBe("manual");
    expect(resolveAlertOrigin(alerta({ category: "jornada" }))).toBe("manual");
    expect(resolveAlertOrigin(alerta({ category: null }))).toBe("manual");
  });
});

describe("isEditableAlert", () => {
  it("manual e checklist são editáveis (sem FK de origem automática)", () => {
    expect(isEditableAlert(alerta({}))).toBe(true);
    expect(isEditableAlert(alerta({ category: "checklist" }))).toBe(true);
  });

  it("manutenção e documento NUNCA são editáveis diretamente — mesma regra que a RLS de escrita aplica", () => {
    expect(isEditableAlert(alerta({ maintenance_schedule_id: "m1" }))).toBe(false);
    expect(isEditableAlert(alerta({ vehicle_document_id: "d1" }))).toBe(false);
  });
});
