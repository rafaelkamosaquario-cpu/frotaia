import { it, expect, vi } from "vitest";
import { getAuthorizedSourceCompanies, hasEnabledFreightSource, canReadFreightOpportunity } from "./freightSourceService";

function clientWith(data: unknown, error: unknown = null) {
  const q = { select: vi.fn(), eq: vi.fn(), or: vi.fn(), limit: vi.fn(),
    then: (resolve: (x: unknown) => unknown) => resolve({ data, error }) };
  for (const fn of [q.select, q.eq, q.or, q.limit]) fn.mockReturnValue(q);
  return { client: { from: vi.fn(() => q) } as never, q };
}
it("fonte privada restringe à empresa cadastrada", async () => {
  const {client,q} = clientWith([{company_id:"empresa-a"}]);
  expect(await getAuthorizedSourceCompanies(client,"grupo")).toEqual(["empresa-a"]);
  expect(q.eq).toHaveBeenCalledWith("enabled",true);
  expect(q.eq).toHaveBeenCalledWith("group_external_id","grupo");
});
it("fonte global somente quando explicitamente cadastrada", async () => {
  expect(await getAuthorizedSourceCompanies(clientWith([{company_id:null}]).client,"grupo")).toBeNull();
  expect(await getAuthorizedSourceCompanies(clientWith([]).client,"grupo")).toEqual([]);
});
it("prontidão exige uma fonte habilitada própria ou global", async () => {
  const {client,q}=clientWith([]);
  expect(await hasEnabledFreightSource(client,"empresa-a")).toBe(false);
  expect(q.or).toHaveBeenCalledWith("company_id.eq.empresa-a,company_id.is.null");
  expect(await hasEnabledFreightSource(clientWith([{id:"fonte"}]).client,"empresa-a")).toBe(true);
});
it("falha de leitura não autoriza fonte", async () => {
  await expect(getAuthorizedSourceCompanies(clientWith(null,new Error("offline")).client,"grupo")).rejects.toThrow("offline");
});
it("revalida acesso de matches antigos e ofertas expiradas", async () => {
  const opportunity={source_group_id:"grupo",status:"new",expires_at:"2099-01-01T00:00:00Z"};
  const {client}=clientWith([{company_id:"empresa-a"}]);
  expect(await canReadFreightOpportunity(client,"empresa-b",opportunity as never)).toBe(false);
  expect(await canReadFreightOpportunity(client,"empresa-a",opportunity as never)).toBe(true);
  expect(await canReadFreightOpportunity(client,"empresa-a",{...opportunity,expires_at:"2020-01-01"} as never)).toBe(false);
});
