import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/supabase/fleetAlertsService", () => ({ computeFleetAlerts: () => [] }));
vi.mock("@/services/supabase/checklistDispatchService", () => ({ dispatchesFromToday: () => [] }));
vi.mock("@/components/frota/ContextualHelp", () => ({ ContextualHelp: () => null }));
vi.mock("@/components/frota/AssistantNotices", () => ({ useAssistantNotices: () => null }));
vi.mock("./ProductionGoals", () => ({ ProductionGoals: ({ assistantEnabled }: { assistantEnabled: boolean }) => <div>Monthly production · assistant {String(assistantEnabled)}</div> }));
vi.mock("./GroupsOverview", () => ({ GroupsOverview: () => <div>Operational groups</div> }));
import { DashboardClient } from "./DashboardOverview";
const props = { companyId: "company", companyName: "Company", groups: [], groupsError: false, canManageGroups: true, veiculos: [], motoristas: [], manutencoes: [], documentos: [], checklistDispatches: [] };
describe("single full and configured dashboard", () => {
  it("renders the same core heading and blocks for full delivery", () => {
    const html = renderToStaticMarkup(<DashboardClient {...props} />);
    for (const text of ["Sua frota, de perto.", "Monthly production", "Operational groups", "Documentos — atenção", "Checklists hoje"]) expect(html).toContain(text);
  });
  it("omits unlicensed modules and assistant controls in configured delivery", () => {
    const html = renderToStaticMarkup(<DashboardClient {...props} enabledModules={["frota", "financeiro"]} />);
    expect(html).toContain("Sua frota, de perto.");
    expect(html).toContain("Monthly production · assistant false");
    for (const text of ["Operational groups", "Documentos — atenção", "Checklists hoje", "Pergunte ao Frota IA"]) expect(html).not.toContain(text);
  });
  it("does not mount monthly data or summaries when financial module is disabled", () => {
    const html = renderToStaticMarkup(<DashboardClient {...props} enabledModules={["frota"]} />);
    for (const text of ["Monthly production", "Receita registrada", "Despesas registradas", "Saldo parcial"]) expect(html).not.toContain(text);
  });
});
