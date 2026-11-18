import {describe,it,expect} from 'vitest';
import {processOnboardingMessage,type OnboardingCollectedData} from './onboardingConversation';
import type {OnboardingState} from '@/lib/supabase/tables';
function start(){let state:OnboardingState='awaiting_name';let data:OnboardingCollectedData={companyId:'subscriber-company',individualBase:{version:2}};return (input:string)=>{const r=processOnboardingMessage(state,JSON.parse(JSON.stringify(data)),input);state=r.nextState;data=r.collectedData;return r;};}
describe('cadastro individual em nove etapas',()=>{
 it('segue a ordem, aceita aliases, separa carroceria e carga, sem inferir eixos do conjunto',()=>{
  const go=start();let r=go('Rafael');expect(r.reply.kind).toBe('list');if(r.reply.kind==='list')expect(r.reply.options.map(o=>o.title)).toEqual(['Volvo','Scania','Mercedes-Benz','Volkswagen','DAF','Iveco','Outra']);
  expect(go('Volks').reply.text).toBe('Qual é o modelo do seu caminhão?');
  expect(go('Constellation 19.360').reply.text).toContain('rígido');
  expect(go('cavalo mecânico').reply.text).toContain('configuração');
  expect(go('6x4').reply.text).toContain('carroceria da carreta');
  expect(go('Tanque').reply.text).toContain('tipo de carga');
  expect(go('Combustíveis').reply.text).toContain('placa');
  expect(go('abc-1d23').reply.text).toContain('cidade e estado');
  expect(go('Canoinhas').reply.text).toBe('Qual é o estado de Canoinhas?');
  r=go('SC');expect(r.finalize).toBe(true);expect(r.collectedData).toMatchObject({companyId:'subscriber-company',name:'Rafael',vehicleBrand:'Volkswagen',plate:'ABC1D23',baseCity:'Canoinhas',baseState:'SC',bodyType:'tanque',axleCount:null,cargoProfile:{type:'Combustíveis'}});
  expect(r.collectedData.vehicleSetup).toMatchObject({kind:'cavalo',formula:'6x4'});expect(r.collectedData.vehicleSetup?.totalAxles).toBeUndefined();
 });
 it('retoma, permite corrigir campo sem apagar os demais e Outra pede texto',()=>{
  const go=start();go('Dércio');expect(go('Outra').reply.text).toContain('Digite a marca');go('Ford');go('Cargo 2429');go('truck');go('6×2');go('Outra');go('Frigorífico');go('Outra');go('Alimentos refrigerados');
  expect(go('placa errada').finalize).toBe(false);go('ABC-1234');go('pausar');expect(go('voltei').reply.text).toContain('cidade e estado');
  expect(go('corrigir marca').reply.text).toContain('marca');let r=go('Volvo');expect(r.collectedData.plate).toBe('ABC1234');expect(r.collectedData.primaryVehicleRaw).toBe('Volvo Cargo 2429');
  r=go('Curitiba, Paraná');expect(r.finalize).toBe(true);expect(r.collectedData.baseState).toBe('PR');expect(r.collectedData.individualBase?.body).toBe('Frigorífico');
 });
 it('não grava uma marca ambígua ou carroceria como carga',()=>{
  const go=start();go('Ana');let r=go('Volvo ou Scania');expect(r.collectedData.vehicleBrand).toBeUndefined();go('Iveco');go('Stralis 400');go('cavalo');go('4x2');go('Tanque');r=go('Tanque');expect(r.collectedData.cargoProfile?.type).toBeUndefined();expect(r.reply.text).toContain('mercadoria');
 });
});

