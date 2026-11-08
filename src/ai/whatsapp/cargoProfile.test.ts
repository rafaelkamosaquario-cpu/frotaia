import { describe, it, expect } from "vitest";
import { nextCargoProfile as next } from "./cargoProfile";
describe("carga e peso declarado", () => {
 it.each(["baú", "graneleiro", "sider"])("%s não é conteúdo da carga", input => expect(next({},input).data.type).toBeUndefined());
 it("aceita fracionada como carga", () => expect(next({},"carga fracionada").data.type).toBe("carga fracionada"));
 it("não assume que levo 14 toneladas seja PBT", () => {
  const r = next({type:"carga seca"},"levo 14 toneladas");
  expect(r.data.weightTonnes).toBe(14); expect(r.data.complete).not.toBe(true);
  expect(next(r.data,"só a carga").data).toMatchObject({weightTonnes:14,weightBasis:"carga",complete:true});
 });
 it.each([["14.000 kg PBT",14,"pbt"],["14,5 toneladas PBTC",14.5,"pbtc"],["14.5 t só carga",14.5,"carga"],["14000 kg PTB",14,"pbt"]])("interpreta %s", (input,weight,basis) => {
  expect(next({type:"grãos"},String(input)).data).toMatchObject({weightTonnes:weight,weightBasis:basis,complete:true});
 });
 it.each(["0 t", "-14 t", "9999 t", "14"])("não conclui peso inválido ou sem unidade %s", input => expect(next({type:"grãos"},input).data.complete).not.toBe(true));
 it("permite peso variável sem inventar número", () => expect(next({type:"diversas"},"varia").data).toMatchObject({complete:true,weightSkipped:true}));
});
