import { describe, it, expect } from "vitest";
import { settlementSchema, settlementLabel, settlementTotals } from "./settlement";
import { modulePathAllowed } from "./companyModules";
const base={kind:"revenues",id:"00000000-0000-4000-8000-000000000001",status:"settled",date:"2026-10-05",note:"Conferido pelo responsável",version:0};
describe("baixas estruturadas",()=>{
  it("permite recebido sem inventar uma data",()=>expect(settlementSchema.parse({...base,date:null}).date).toBeNull());
  it("recusa data futura e inválida",()=>{
    expect(settlementSchema.safeParse({...base,date:"2099-01-01"}).success).toBe(false);
    expect(settlementSchema.safeParse({...base,date:"2026-02-30"}).success).toBe(false);
  });
  it("não aceita data de baixa em pendência",()=>expect(settlementSchema.safeParse({...base,status:"pending"}).success).toBe(false));
  it("não permite alterar valor, empresa ou competência pela baixa",()=>{
    for(const extra of [{amount:1},{company_id:"other"},{revenue_date:"2026-10-01"}])
      expect(settlementSchema.safeParse({...base,...extra}).success).toBe(false);
  });
  it("distingue passado desconhecido de pendente e recebido",()=>{
    expect(settlementLabel({})).toBe("Não informado");
    expect(settlementLabel({settlement_status:"settled"},true)).toBe("Recebida");
    expect(settlementTotals([{amount:0.1,settlement_status:"settled"},{amount:0.2,settlement_status:"settled"},{amount:50},{amount:20,settlement_status:"pending"}])).toEqual({settled:0.3,unknown:50,pending:20});
  });
  it("baixas respeitam o módulo financeiro",()=>expect(modulePathAllowed(["frota"],"/api/frota/baixas")).toBe(false));
});
