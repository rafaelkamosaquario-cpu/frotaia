import {describe,it,expect} from "vitest";
import {processOnboardingMessage,firstOnboardingMessage,type OnboardingCollectedData} from "./onboardingConversation";
import type {OnboardingState} from "@/lib/supabase/tables";
function journey(inputs:string[]){
 let state:OnboardingState="awaiting_name",data:OnboardingCollectedData={};let last;
 for(const input of inputs){last=processOnboardingMessage(state,data,input);state=last.nextState;data=last.collectedData;}
 return last!;
}
const base=["Rafael","motorista_autonomo","Iveco","Stralis 400 2012","mlc-4c38","cavalo","4x2","carreta LS 3 eixos","bau","Carga fracionada","14","2,8","Antônio Olinto - PR","variadas"];
describe("cadastro do veículo antes da operação",()=>{
 it("salva dados reais declarados, peso só da carga e exige confirmação",()=>{
  const r=journey(base);
  expect(r.finalize).toBe(false);expect(r.collectedData.pendingCombinedConfirmation).toBe(true);
  expect(r.collectedData.primaryVehicleRaw).toBe("Iveco Stralis 400 2012");
  expect(r.collectedData.plate).toBe("MLC4C38");
  expect(r.collectedData.vehicleSetup?.totalAxles).toBe(5);
  expect(r.collectedData.cargoProfile).toMatchObject({weightTonnes:14,weightBasis:"carga",complete:true});
  expect(r.collectedData.averageConsumptionKmL).toBe(2.8);
  expect(r.reply.text).toContain("Nome: Rafael");
  expect(journey([...base,"sim"]).finalize).toBe(true);
 });
 it("truck sem implemento e consumo desconhecido, com rota fixa",()=>{
  const r=journey(["José","apenas_motorista","Volvo","VM 270 2020","ABC1234","truck","6x2","não","grade_baixa","Madeira","14000 kg","não sei","Curitiba - PR","fixa","Curitiba PR para Joinville SC"]);
  expect(r.collectedData.vehicleSetup).toMatchObject({kind:"caminhao",attached:false,totalAxles:3});
  expect(r.collectedData.averageConsumptionKmL).toBeUndefined();
  expect(r.collectedData.primaryRouteRaw).toContain("Joinville");
  expect(r.collectedData.pendingCombinedConfirmation).toBe(true);
 });
 it("saudação de assinatura depende de pagamento e perfil vai para a marca",()=>{
  expect(firstOnboardingMessage(true)).toContain("Parabéns pela sua assinatura");
  expect(firstOnboardingMessage()).not.toContain("assinatura");
  expect(journey(["Ana","dono_empresa"]).nextState).toBe("awaiting_primary_vehicle");
 });
 it("placa inválida não avança",()=>{
  expect(journey(["Ana","dono_empresa","DAF","XF 480 2022","123"]).nextState).toBe("awaiting_plate");
 });
});
