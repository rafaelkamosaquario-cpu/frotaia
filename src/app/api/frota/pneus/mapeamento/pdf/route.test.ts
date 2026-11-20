import {beforeEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({access:vi.fn(),admin:vi.fn()}));
vi.mock("@/services/supabase/tireCaseAccess",()=>({tireCaseAccess:m.access}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.admin}));
import {GET} from './route';
beforeEach(()=>vi.clearAllMocks());
it('does not disclose inventory PDF without ADM access',async()=>{m.access.mockResolvedValue(null);expect((await GET(new Request('https://f.test/api?id=00000000-0000-4000-8000-000000000001&vehicle=00000000-0000-4000-8000-000000000002'))).status).toBe(403);expect(m.admin).not.toHaveBeenCalled();});
it('rejects malformed record and vehicle IDs before database access',async()=>{m.access.mockResolvedValue({company:{id:'company'},userId:'owner'});expect((await GET(new Request('https://f.test/api?id=invalid'))).status).toBe(400);expect(m.admin).not.toHaveBeenCalled();});
it('scopes record lookup to owner and company',async()=>{m.access.mockResolvedValue({company:{id:'company'},userId:'owner'});const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);m.admin.mockReturnValue({from:vi.fn().mockReturnValue(q)});expect((await GET(new Request('https://f.test/api?id=00000000-0000-4000-8000-000000000001&vehicle=00000000-0000-4000-8000-000000000002'))).status).toBe(404);expect(q.eq).toHaveBeenCalledWith('company_id','company');expect(q.eq).toHaveBeenCalledWith('actor_id','owner');});
