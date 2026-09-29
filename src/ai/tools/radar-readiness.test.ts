import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ source:vi.fn(), create:vi.fn(), list:vi.fn(), status:vi.fn() }));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
vi.mock("@/services/supabase/freightSourceService",()=>({hasEnabledFreightSource:mocks.source}));
vi.mock("@/services/supabase/vehicleService",()=>({getVehicle:vi.fn()}));
vi.mock("@/services/supabase/freightRadarService",()=>({
  createRadar:mocks.create, listRadarsForCompany:mocks.list, setRadarStatus:mocks.status,
  updateRadar:vi.fn(), RADAR_DURACAO_PADRAO_DIAS:7,
}));
import { ferramentaGerenciarRadarFrete } from "./gerenciar-radar-frete";
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.source.mockResolvedValue(false);
  mocks.create.mockResolvedValue({id:"radar"});
  mocks.list.mockResolvedValue([{id:"radar"}]);
  mocks.status.mockResolvedValue({id:"radar"});
});
it("salva busca mas não promete monitoramento sem fonte",async()=>{
  const r=await ferramentaGerenciarRadarFrete.executar({modo:"CRIAR",userId:"u",companyId:"c",origemUf:"PR"});
  expect(r.sucesso).toBe(true);
  expect(r.mensagemResumo).toContain("Não há monitoramento");
  expect(mocks.source).toHaveBeenCalledWith({},"c");
});
it("fonte habilitada permite confirmação condicionada às ofertas",async()=>{
  mocks.source.mockResolvedValue(true);
  const r=await ferramentaGerenciarRadarFrete.executar({modo:"CRIAR",userId:"u",companyId:"c",origemUf:"PR"});
  expect(r.mensagemResumo).toContain("fontes autorizadas");
  expect(r.mensagemResumo).toContain("não há garantia");
});
it("listagem e reativação avisam quando a fonte está ausente",async()=>{
  const list=await ferramentaGerenciarRadarFrete.executar({modo:"LISTAR",userId:"u",companyId:"c"});
  const active=await ferramentaGerenciarRadarFrete.executar({modo:"ATIVAR",userId:"u",companyId:"c",radarId:"r"});
  expect(list.mensagemResumo).toContain("Falta habilitar");
  expect(active.mensagemResumo).toContain("falta habilitar");
});
