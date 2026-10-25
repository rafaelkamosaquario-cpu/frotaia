import {describe,it,expect,vi,beforeEach} from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),context:vi.fn(),subscription:vi.fn(),allowed:vi.fn(),modules:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:m.user}})}));
vi.mock("@/ai/context/customerContext",()=>({loadCustomerContext:m.context}));
vi.mock("./subscriptionService",()=>({getSubscription:m.subscription,isAccessAllowed:m.allowed}));
vi.mock("./companyModulesService",()=>({readCompanyModules:m.modules}));
import {individualAccess} from "./individualAccess";
describe("acesso individual",()=>{
 beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({data:{user:{id:"u"}}});m.context.mockResolvedValue({company:{id:"c"},role:"owner",profile:{is_admin:false}});m.allowed.mockReturnValue(true);m.modules.mockResolvedValue(null);});
 it("nega sem login",async()=>{m.user.mockResolvedValue({data:{user:null}});expect(await individualAccess()).toEqual({ok:false,status:401});expect(m.context).not.toHaveBeenCalled();});
 it("nega sem vínculo",async()=>{m.context.mockResolvedValue({company:null});expect((await individualAccess()).ok).toBe(false);});
 it("não libera finanças a motorista por esta rota",async()=>{m.context.mockResolvedValue({company:{id:"c"},role:"driver"});expect((await individualAccess()).ok).toBe(false);});
 it("nega assinatura inativa",async()=>{m.allowed.mockReturnValue(false);expect((await individualAccess()).ok).toBe(false);});
 it("preserva módulos limitados",async()=>{m.modules.mockResolvedValue({enabled:["assistente"]});const r=await individualAccess();expect(r.ok&&r.enabled).toEqual(["assistente"]);});
 it("permite cliente individual ativo",async()=>{expect((await individualAccess()).ok).toBe(true);});
});
