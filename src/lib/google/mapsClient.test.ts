import {describe,it,expect,vi,afterEach} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./mapsConfig",()=>({getGoogleMapsConfig:()=>({GOOGLE_MAPS_API_KEY:"test-only"})}));
import {calcularRota} from "./mapsClient";
afterEach(()=>vi.unstubAllGlobals());
describe("rotas alternativas reais do provedor",()=>{
 it("solicita alternativas e preserva distância individual sem somar volta",async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({routes:[
   {distanceMeters:400000,duration:"18000s",description:"Rodovia A",polyline:{encodedPolyline:"a"}},
   {distanceMeters:440000,duration:"19000s",description:"Rodovia B",polyline:{encodedPolyline:"b"}}
  ]})});vi.stubGlobal("fetch",fetchMock);
  const r=await calcularRota({latitude:1,longitude:2},{latitude:3,longitude:4},true);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).computeAlternativeRoutes).toBe(true);
  expect(r.distanciaMetros).toBe(400000);
  expect(r.alternativas).toEqual([
   {distanciaMetros:400000,duracaoSegundos:18000,descricao:"Rodovia A",polylineCodificada:"a"},
   {distanciaMetros:440000,duracaoSegundos:19000,descricao:"Rodovia B",polylineCodificada:"b"}
  ]);
 });
 it("mantém chamada existente sem alternativas e não inventa rota se provedor falhar",async()=>{
  const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({routes:[]})});vi.stubGlobal("fetch",f);
  await expect(calcularRota({latitude:1,longitude:2},{latitude:3,longitude:4})).rejects.toThrow("não encontrou");
  expect(JSON.parse(f.mock.calls[0][1].body).computeAlternativeRoutes).toBe(false);
 });
});
