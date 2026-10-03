import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { attachCompanyScope, requestCompanyScope, COMPANY_COOKIE, COMPANY_HEADER } from "@/lib/frota/companyScope";
import type { Database } from "./database.types";

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route
 * Handlers. Respeita a sessão do usuário via cookies — nunca usa a secret
 * key. Para operações administrativas (bypass de RLS), ver admin.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component: seguro ignorar
            // porque o middleware (ver middleware.ts) já cuida de manter
            // a sessão atualizada em cada requisição.
          }
        },
      },
    }
  );
  const requestHeaders = await headers();
  const path = requestHeaders.get("x-frota-path") ?? "";
  attachCompanyScope(client, requestCompanyScope(path,requestHeaders.get(COMPANY_HEADER),cookieStore.get(COMPANY_COOKIE)?.value));
  return client;
}
