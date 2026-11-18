import {describe,it,expect} from 'vitest';
import {processOnboardingMessage,type OnboardingCollectedData} from './onboardingConversation';
import type {OnboardingState} from '@/lib/supabase/tables';
function start(){let state:OnboardingState='awaiting_name';let data:OnboardingCollectedData={companyId:'company',existingVehicleId:'same-vehicle'};return(input:string)=>{const r=processOnboardingMessage(state,JSON.parse(JSON.stringify(data)),input);state=r.nextState;data=r.collectedData;return r;};}
function untilFuel(){const go=start();for(const answer of ['Rafael','Scania','P310','rigido','6x2','Carga seca','Madeira','2020'])expect(go(answer).reply.text).toContain('✅ Registrado');return go;}
describe('cadastro ampliado com confirmações e seleção de insumos',()=>{
 it('permite S10 + Arla, troca para S500 e desmarca Arla antes de confirmar',()=>{
  const go=untilFuel();go('fuel_s10');let r=go('fuel_arla');expect(r.collectedData.individualBase).toMatchObject({fuelType:'diesel_s10',usesArla:true,fuelConfirmed:false});
  go('fuel_s500');go('fuel_arla');r=go('fuel_confirm');expect(r.reply.text).toContain('✅ Registrado');expect(r.collectedData.individualBase).toMatchObject({fuelType:'diesel_s500',usesArla:false,fuelConfirmed:true});
  r=go('R$ 6,50');expect(r.collectedData.individualBase?.fuelPrice).toBe(6.5);go('ABC-0125');r=go('Bituruna, PR');expect(r.finalize).toBe(true);expect(r.collectedData.existingVehicleId).toBe('same-vehicle');expect(r.collectedData.individualBase?.manufactureYear).toBe(2020);
 });
 it('aceita combinação digitada e preço desconhecido, sem inventar custo',()=>{
  const go=untilFuel();go('S10 e Arla');go('confirmar');const r=go('Não sei');expect(r.reply.text).toContain('Preço do diesel fica para depois');expect(r.collectedData.individualBase?.fuelPrice).toBeUndefined();expect(r.collectedData.individualBase?.fuelPriceAsked).toBe(true);
 });
 it('Arla sozinho não confirma combustível e valida ano e preço',()=>{
  const go=untilFuel();go('fuel_arla');expect(go('fuel_confirm').reply.text).toContain('Selecione o diesel');go('S500 e Arla');go('confirmar');expect(go('0').reply.text).not.toContain('✅');expect(go('6,50 por litro').reply.text).toContain('✅');
 });
 it('Digitar abre campo de marca e tipo sem registrar opção como dado',()=>{
  const go=start();go('Rafael');expect(go('Digitar').reply.text).toContain('Digite a marca');go('Ford');go('Cargo 2429');expect(go('Digitar').reply.text).toContain('Digite o tipo');expect(go('truque').collectedData.vehicleSetup?.kind).toBe('caminhao');
 });
});

