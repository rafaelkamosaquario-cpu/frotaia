import { describe, it, expect } from "vitest";
import { buildAssistantNotices } from "./assistantNotices";
import type { MonthlySnapshot } from "./monthlyMonitoring";
const snapshot: MonthlySnapshot = {month:"2026-09",today:"2026-10-07",rows:[],revenueSummary:null,expenseSummary:null};
const alert = {id:"doc-1",descricao:"Seguro — ABC1234 — vence hoje",data:"2026-10-07",vencido:false,diasRestantes:0,href:"/frota/documentos"};
describe("assistant dashboard notices", () => {
  it("does not invent group receipts or monthly results", () => {
    expect(buildAssistantNotices(null, [])).toEqual([]);
    const notices = buildAssistantNotices(snapshot, []);
    expect(notices[0].text).toContain("indisponível");
    expect(notices[0].text).not.toContain("Saldo");
  });
  it("keeps identity stable across refreshes and changes it with source data", () => {
    expect(buildAssistantNotices(snapshot,[alert])).toEqual(buildAssistantNotices({...snapshot,checkedAt:"later"},[alert]));
    expect(buildAssistantNotices(null,[alert])[0].id).not.toBe(buildAssistantNotices(null,[{...alert,data:"2026-10-08"}])[0].id);
    expect(buildAssistantNotices(snapshot,[])[0].id).not.toBe(buildAssistantNotices({...snapshot,month:"2026-10"},[])[0].id);
  });
  it("routes to source records and includes the financial period in the question", () => {
    const notices=buildAssistantNotices(snapshot,[alert]);
    expect(notices[0].question).toContain("2026-09");
    expect(notices[1].href).toBe("/frota/documentos");
    expect(notices[1].question).toContain(alert.descricao);
  });
});
