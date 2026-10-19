import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SettlementSummary, SettlementFilter } from "./SettlementControl";
it("mostra situações sem chamar competência de saldo bancário",()=>{
  const html=renderToStaticMarkup(<SettlementSummary rows={[{amount:100,settlement_status:"settled"},{amount:20,settlement_status:"pending"},{amount:30}]} revenue/>);
  expect(html).toContain("Recebidas");expect(html).toContain("A receber");expect(html).toContain("Não informado");
  expect(html).toContain("Não é saldo bancário");
});
it("oferece situação desconhecida no filtro",()=>{
  const html=renderToStaticMarkup(<SettlementFilter value="unknown" onChange={()=>{}}/>);
  expect(html).toContain('value="unknown" selected');expect(html).toContain("A pagar");
});
