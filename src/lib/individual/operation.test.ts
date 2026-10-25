import {describe,it,expect} from "vitest";
import {operationPeriod,financialSummary} from "./operation";
describe("resumo individual",()=>{
 it("usa meses reais e ano bissexto",()=>{expect(operationPeriod("2026-09").to).toBe("2026-09-30");expect(operationPeriod("2028-02").to).toBe("2028-02-29");});
 it.each(["2026-13","2026-00","2026-1","1999-12","x"])("rejeita %s",month=>expect(()=>operationPeriod(month)).toThrow());
 it("separa baixa desconhecida, pendente e realizada sem dupla soma",()=>{const r=financialSummary([{amount:10.1,settlement_status:"settled"},{amount:20.2,settlement_status:"pending"},{amount:30}], [{amount:100,settlement_status:"settled"},{amount:50}]);expect(r.expenses).toBe(60.3);expect(r.revenues).toBe(150);expect(r.paid).toBe(10.1);expect(r.unknownExpenses).toBe(30);expect(r.pendingExpenses).toBe(20.2);expect(r.received).toBe(100);expect(r.unknownRevenues).toBe(50);});
});
