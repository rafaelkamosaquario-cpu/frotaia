// Request-local client identity, never a process-global selected tenant.
const scopes = new WeakMap<object, string>();
export const COMPANY_COOKIE = "frota_company";
export const COMPANY_HEADER = "x-frota-company";
export function attachCompanyScope(client: object, value: string | undefined | null) {
  if (value !== undefined && value !== null) scopes.set(client, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : "00000000-0000-0000-0000-000000000000");
}
export function companyScope(client: object) { return scopes.get(client); }

export function requestCompanyScope(path:string, header:string|null, cookie:string|undefined) {
  if (path === "/api/chat") return header; // Only the panel widget sends the explicit scope.
  if (path === "/frota" || path.startsWith("/frota/") || path === "/frota-ativacao" || path.startsWith("/api/frota/")) return header ?? cookie;
  return undefined; // Checkout, account linking and WhatsApp keep the default company.
}

export function scopedCompanyFetch(previous:typeof fetch, companyId:string, baseUrl:string):typeof fetch {
  return (input,init)=>{
    const url=new URL(input instanceof Request?input.url:String(input),baseUrl);
    if(url.origin===new URL(baseUrl).origin && requestCompanyScope(url.pathname,companyId,undefined)) {
      const headers=new Headers(input instanceof Request?input.headers:undefined);
      new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));
      headers.set(COMPANY_HEADER,companyId);
      return previous(input,{...init,headers});
    }
    return previous(input,init);
  };
}
