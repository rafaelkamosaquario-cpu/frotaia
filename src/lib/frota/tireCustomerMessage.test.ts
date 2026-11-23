import {describe,it,expect} from 'vitest';
import {tireCustomerMessage} from './tireCustomerMessage';
const base={name:'Ademir — Rio Azul',plate:'UAY4J09',vehicle:'Scania P320 8x2',traction:true};
describe('customer tire message',()=>{
 it('calculates rotation from installation, preserving dates and initial depth',()=>{
  const text=tireCustomerMessage({...base,stages:[{label:'Aplicação',date:'2026-11-14',km:139812,depth:20},{label:'1ª inspeção',date:'2026-12-01',km:150000,depth:18}]});
  expect(text).toContain('14/11/2026');expect(text).toContain('Sulco inicial: 20 mm');expect(text).toContain('174.812 a 179.812 km');expect(text).not.toContain('185.000');expect(text).toContain('15 dias');expect(text).toContain('RodoCore: inteligência que move frotas.');
 });
 it('does not invent missing application or depth, or advise traction rotation for steering tires',()=>{
  const text=tireCustomerMessage({...base,traction:false,stages:[]});expect(text).not.toContain('35.000');expect(text).not.toContain('Sulco inicial');expect(text).not.toContain('Data da instalação');
 });
 it('keeps different installation readings associated with their tire codes',()=>{
  const text=tireCustomerMessage({...base,stages:[{label:'Aplicação',date:'2026-01-01',km:100000,codes:['A']},{label:'Aplicação',date:'2026-02-01',km:120000,codes:['B']}]});
  expect(text).toContain('pneus A:');expect(text).toContain('135.000 a 140.000 km');expect(text).toContain('pneus B:');expect(text).toContain('155.000 a 160.000 km');expect(text).not.toContain('Sulco inicial');
 });
});