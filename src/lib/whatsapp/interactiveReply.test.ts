import {describe,it,expect} from 'vitest';
import {interactiveReply} from './interactiveReply';
import {processOnboardingMessage} from '@/ai/whatsapp/onboardingConversation';
describe('respostas dos botões no cadastro',()=>{
 it.each([
  {buttonsResponseMessage:{buttonId:'rigido'}},
  {buttonReply:{buttonId:'rigido'}},
  {buttonReply:{id:'rigido',displayText:'Rígido (truck)'}},
  {quickReplyButton:{id:'rigido',displayText:'Rígido (truck)'}},
  {buttonReply:{displayText:'Rígido (truck)'}},
 ])('avança rígido até configuração: %j',body=>{
  const text=interactiveReply(body)!;
  const r=processOnboardingMessage('awaiting_primary_vehicle',{companyId:'company',name:'Rafael',vehicleBrand:'Scania',individualBase:{version:2,step:'kind',model:'P310'}},text);
  expect(r.collectedData.vehicleSetup?.kind).toBe('caminhao');expect(r.collectedData.individualBase?.step).toBe('formula');expect(r.reply.text).toContain('configuração');
 });
 it('ignora callback de status e metadados sem resposta',()=>{
  expect(interactiveReply({})).toBeUndefined();expect(interactiveReply({buttonReply:{referenceMessageId:'rigido'}})).toBeUndefined();
 });
});

