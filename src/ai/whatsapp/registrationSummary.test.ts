import {describe,it,expect} from 'vitest';
import {registrationSummary} from './registrationSummary';
import type {CustomerContext,VehicleContext} from '@/ai/context/customerContext';
describe('resumo cadastral do motorista e caminhão',()=>{
 it('separa Rafael de Scania P310 e omite lista de dados opcionais',()=>{
  const s=registrationSummary({profile:{full_name:'Rafael'}} as CustomerContext,{vehicle:{name:'Scania P310',brand:'Scania',model:'P310',plate:'ABC0125',vehicle_type:'truck',axle_count:3,body_type:'grade_baixa',model_year:2020,notes:'Caminhão rígido 6x2\nCarga: Madeira; peso habitual: não informado\nCombustível informado: diesel; especificação S10/S500 não informada.'}} as VehicleContext);
  expect(s).toContain('Motorista: Rafael');expect(s).toContain('Caminhão: Scania P310');expect(s).toContain('`ABC-0125`');expect(s).toContain('Truck · 3 eixos');expect(s).toContain('6x2');expect(s).toContain('Carga habitual: Madeira');expect(s).toContain('Combustível: diesel');
  expect(s).not.toMatch(/não informado|seguro|licenciamento|odômetro|2020|S10/);
 });
 it('não usa o nome do caminhão como nome da pessoa',()=>{
  const s=registrationSummary({profile:null} as CustomerContext,{vehicle:{name:'Scania P310',plate:'ABC1D23'}} as VehicleContext);
  expect(s).not.toContain('Motorista:');expect(s).toContain('Identificação do caminhão: Scania P310');expect(s).toContain('`ABC1D23`');
 });
});

