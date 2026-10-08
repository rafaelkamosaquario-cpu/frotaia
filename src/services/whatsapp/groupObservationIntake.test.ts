import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const ai=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/anthropic/client',()=>({CLAUDE_MODEL:'test',createAnthropicClient:()=>({messages:{create:ai}})}));
const download=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/whatsapp/mediaDownloader',()=>({baixarMidia:download,paraBase64:()=>''}));
import {processOperationalObservation,interpretObservation} from './groupObservationIntake';
import type {SupabaseDbClient} from '@/services/supabase/types';
const evidence={summary:'Abasteceu 100 litros.',category:'abastecimento',plate:null,driver:null,date:null,liters:100,tonnes:null,amountReais:null,uncertainties:[]};
function client(results:unknown[]) {
 const calls:unknown[][]=[];const queries:unknown[]=[];
 const from=vi.fn((table:string)=>{queries.push(table);const value=results.shift();const chain={select:vi.fn(()=>chain),eq:vi.fn((...args:unknown[])=>{calls.push(args);return chain;}),insert:vi.fn((...args:unknown[])=>{calls.push(args);return chain;}),update:vi.fn((...args:unknown[])=>{calls.push(args);return chain;}),maybeSingle:vi.fn(async()=>value),single:vi.fn(async()=>value),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(value).then(resolve)};return chain;});
 return {db:{from} as unknown as SupabaseDbClient,calls,queries,from};
}
const binding={company_id:'tenant-a',registry_id:'reg-a',enabled:true};
const input={phone:'123-group',messageId:'message-a',text:{message:'Abasteci 100 litros'}};
describe('silent operational intake',()=>{
 beforeEach(()=>{vi.clearAllMocks();ai.mockResolvedValue({content:[{type:'text',text:JSON.stringify(evidence)}]});});
 it('ignores unbound groups without reading their content',async()=>{const c=client([{data:null}]);expect(await processOperationalObservation(c.db,input)).toBe(false);expect(ai).not.toHaveBeenCalled();});
 it('fails closed on binding lookup errors',async()=>{const c=client([{error:{code:'DB'}}]);await expect(processOperationalObservation(c.db,input)).rejects.toThrow();expect(ai).not.toHaveBeenCalled();});
 it('consumes paused groups, never allowing the replying pilot to run',async()=>{const c=client([{data:{...binding,enabled:false}}]);expect(await processOperationalObservation(c.db,input)).toBe(true);expect(c.from).toHaveBeenCalledTimes(1);});
 it('consumes archived groups without AI',async()=>{const c=client([{data:binding},{data:{archived:true}}]);expect(await processOperationalObservation(c.db,input)).toBe(true);expect(ai).not.toHaveBeenCalled();});
 it('deduplicates provider redelivery before AI',async()=>{const c=client([{data:binding},{data:{archived:false}},{error:{code:'23505'}}]);expect(await processOperationalObservation(c.db,input)).toBe(true);expect(ai).not.toHaveBeenCalled();});
 it('stores only observation in the bound company, no financial writes',async()=>{const c=client([{data:binding},{data:{archived:false}},{data:{id:'event-a'}},{error:null}]);expect(await processOperationalObservation(c.db,input)).toBe(true);expect(c.queries).toEqual(['operational_group_bindings','operational_group_registry','operational_group_observations','operational_group_observations']);expect(c.calls).toContainEqual(['company_id','tenant-a']);expect(c.calls).toContainEqual([expect.objectContaining({status:'review',summary:evidence.summary})]);expect(ai.mock.calls[0][0]).not.toHaveProperty('tools');});
 it('surfaces model failures as review pending, without invented values',async()=>{ai.mockRejectedValue(new Error('provider'));const c=client([{data:binding},{data:{archived:false}},{data:{id:'event-a'}},{error:null}]);await processOperationalObservation(c.db,input);expect(c.calls).toContainEqual([expect.objectContaining({status:'unreadable',evidence:{}})]);});
 it('does not process own echoes or missing group ids',async()=>{const c=client([]);expect(await processOperationalObservation(c.db,{...input,fromMe:true})).toBe(false);expect(c.from).not.toHaveBeenCalled();});
 it('blocks untrusted media hosts before fetch',async()=>{await expect(interpretObservation({...input,image:{imageUrl:'https://127.0.0.1/file'}})).rejects.toThrow();expect(download).not.toHaveBeenCalled();expect(ai).not.toHaveBeenCalled();});
 it('marks audio unsupported instead of pretending to understand it',async()=>{await expect(interpretObservation({...input,audio:{audioUrl:'https://example.com'}})).rejects.toThrow('Áudio');expect(ai).not.toHaveBeenCalled();});
});
