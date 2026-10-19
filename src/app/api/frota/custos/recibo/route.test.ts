import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), admin: vi.fn(), entry: vi.fn(), pdf: vi.fn(), eq: vi.fn(), maybe: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/services/supabase/fleetPanelAccess", () => ({ loadFleetPanelAccess: m.access }));
vi.mock("@/services/supabase/costAdvanceService", () => ({ readCostEntry: m.entry }));
vi.mock("@/services/documents/salaryReceipt", () => ({ generateSalaryReceipt: m.pdf }));
import { GET } from "./route";
const req = () => new Request("https://f.test/api/frota/custos/recibo?id=00000000-0000-4000-8000-000000000001");
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ ok: true, role: "admin", company: { id: "company-a", name: "Empresa A" } });
  const q = { select: vi.fn(), eq: m.eq, maybeSingle: m.maybe };
  q.select.mockReturnValue(q); m.eq.mockReturnValue(q); m.maybe.mockResolvedValue({data:{name:"VITOR",phone_e164:"+5542000000000"},error:null});
  m.admin.mockReturnValue({ from: vi.fn().mockReturnValue(q) });
  m.entry.mockResolvedValue({id:"entry",month:"2026-09",expense_id:"expense",paid_on:"2026-10-06",snapshot:{category:"salario",person:"VITOR",driverId:"driver"}});
  m.pdf.mockResolvedValue(new Uint8Array([37,80,68,70]));
});
it("bloqueia não autenticado antes de consultar dados", async () => { m.access.mockResolvedValue({ok:false,reason:"unauthenticated"}); expect((await GET(req())).status).toBe(401); expect(m.admin).not.toHaveBeenCalled(); });
it("bloqueia perfil sem permissão", async () => { m.access.mockResolvedValue({ok:true,role:"viewer"}); expect((await GET(req())).status).toBe(403); expect(m.admin).not.toHaveBeenCalled(); });
it("consulta lançamento e motorista somente na empresa selecionada", async () => {
  const res = await GET(req()); expect(res.status).toBe(200);
  expect(m.entry).toHaveBeenCalledWith(expect.anything(),"company-a",expect.any(String));
  expect(m.eq).toHaveBeenCalledWith("company_id","company-a");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
});
it("não emite recibo para registro alheio ou inexistente", async () => {m.entry.mockRejectedValue({code:"PGRST116"});expect((await GET(req())).status).toBe(404);expect(m.pdf).not.toHaveBeenCalled();});
it("não emite quitação de salário pendente", async () => {m.entry.mockResolvedValue({expense_id:"e",paid_on:null,snapshot:{category:"salario"}});expect((await GET(req())).status).toBe(409);expect(m.pdf).not.toHaveBeenCalled();});
