import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const query=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:query})})})})}));
vi.mock('./config',()=>({getWhatsappConfig:()=>({ZAPI_INSTANCE_ID:'i',ZAPI_INSTANCE_TOKEN:'t',ZAPI_CLIENT_TOKEN:'c'})}));
import {sendWhatsappGroupText,sendWhatsappGroupButtons} from './zapiClient';
const fetcher=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetcher);});afterEach(()=>vi.unstubAllGlobals());
it.each([{data:{registry_id:'r'}},{error:{code:'DB'}}])('blocks text and buttons before any provider send when protected %j',async result=>{
 query.mockResolvedValue(result);
 await expect(sendWhatsappGroupText('123-group','must not send')).rejects.toThrow('bloqueado');
 await expect(sendWhatsappGroupButtons('123-group','must not send',[{id:'x',label:'X'}])).rejects.toThrow('bloqueado');
 expect(fetcher).not.toHaveBeenCalled();
});
it('retains sending for an unbound legacy pilot',async()=>{query.mockResolvedValue({data:null});fetcher.mockResolvedValue(new Response('{}'));await sendWhatsappGroupText('123-group','legacy');expect(fetcher).toHaveBeenCalledOnce();});
