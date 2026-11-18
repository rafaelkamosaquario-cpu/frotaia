import {describe,it,expect} from "vitest";
import {documentDemoButtons,resolveDemoAction,routeDemoButtons} from "./demoActions";
describe("opções de demonstração",()=>{
 it("usa ações de leitura sem registrar lançamentos",()=>{
  expect(resolveDemoAction("demo_doc_frete")?.track).toBe("documentos");
  expect(resolveDemoAction("demo_doc_frete")?.text).toContain("Não registre receita");
  expect(resolveDemoAction("constructor")).toBeNull();
  expect(resolveDemoAction("registrar_despesa")).toBeNull();
 });
 it("oferece conferência de litros e total para abastecimento",()=>{
  const r=documentDemoButtons("Diesel: 100 litros, R$ 7 por litro.");
  if(r.kind!=="buttons")throw Error("buttons");
  expect(r.options.map(o=>o.id)).toContain("demo_doc_total");
  expect(r.options.map(o=>o.id)).not.toContain("demo_doc_frete");
 });
 it("cada botão tem ação reconhecida, até 3 opções e rótulo curto",()=>{
  for(const r of [documentDemoButtons("CT-e"),documentDemoButtons("abastecimento diesel"),routeDemoButtons()]){
   if(r.kind!=="buttons")throw Error("buttons");
   expect(r.options.length).toBeLessThanOrEqual(3);
   for(const o of r.options){expect(resolveDemoAction(o.id)).toBeTruthy();expect(o.label.length).toBeLessThanOrEqual(20);}
  }
 });
 it("botão de combustível muda a área sem perder o contexto da rota",()=>{
  expect(resolveDemoAction("demo_rota_combustivel")?.track).toBe("custo");
  expect(resolveDemoAction("demo_rota_combustivel")?.text).toContain("rota de ida consultada");
 });
});
