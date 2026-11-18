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
import {isRegistrationSummaryRequest,registrationReply} from './registrationSummary';
it('reconhece os áudios reais sem interceptar correções e pedidos compostos',()=>{
 for(const t of ['Me traga o resumo do cadastro, faz favor.','Quero que você traga pra mim como é que ficou o cadastro do meu caminhão.','Tá, traga pra mim o resumo do que foi cadastrado, então, do meu veículo pra mim conferir.'])expect(isRegistrationSummaryRequest(t)).toBe(true);
 for(const t of ['Corrija meu cadastro para Volvo','Atualize meu cadastro','Traga meu cadastro e calcule o frete','Quero cadastrar outro veículo'])expect(isRegistrationSummaryRequest(t)).toBe(false);
});
it('usa carroceria confirmada e cidade atual sem pedir campos opcionais',()=>{
 const s=registrationReply({profile:{full_name:'Rafael'},company:{city:'Bituruna',state:'PR'}} as CustomerContext,{vehicle:{brand:'Scania',model:'P310',body_type:'grade_baixa',notes:'Carroceria: Carga seca\nAno de fabricação informado: 2020\nUso de Arla: não',fuel_type:'diesel_s10'}} as VehicleContext);
 expect(s).toContain('Motorista: Rafael');expect(s).toContain('Carroceria: Carga seca');expect(s).toContain('Bituruna, PR');expect(s).toContain('Ano de fabricação: 2020');expect(s).not.toMatch(/grade baixa|faltam|completar|seguro|licenciamento/i);
});

