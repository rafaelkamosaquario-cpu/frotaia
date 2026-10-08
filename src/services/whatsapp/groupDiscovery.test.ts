import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/whatsapp/config',()=>({getWhatsappConfig:()=>({ZAPI_INSTANCE_ID:'i',ZAPI_INSTANCE_TOKEN:'t',ZAPI_CLIENT_TOKEN:'c'})}));
import {findExactOperationalGroup} from './groupDiscovery';
const fetcher=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',fetcher);});afterEach(()=>vi.unstubAllGlobals());
it('resolves only exact normalized name',async()=>{fetcher.mockResolvedValue(Response.json([{isGroup:true,name:' ABASTECIDA MÊS 10 ',phone:'123-group'},{isGroup:true,name:'ABASTECIDA MÊS 11',phone:'456-group'}]));expect(await findExactOperationalGroup('abastecida mês 10')).toBe('123-group');expect(fetcher.mock.calls[0][1].method).toBeUndefined();});
it('rejects ambiguous group names',async()=>{fetcher.mockResolvedValue(Response.json([{isGroup:true,name:'G',phone:'123-group'},{isGroup:true,name:'G',phone:'456-group'}]));await expect(findExactOperationalGroup('G')).rejects.toThrow('iguais');});
it('rejects missing groups and provider errors',async()=>{fetcher.mockResolvedValue(Response.json([]));await expect(findExactOperationalGroup('G')).rejects.toThrow('não encontrado');fetcher.mockResolvedValue(new Response('',{status:401}));await expect(findExactOperationalGroup('G')).rejects.toThrow('Z-API');});
