import { z } from "zod";

export const CONSULTANT_EMAIL = "rafaelkamosaquario@gmail.com";
export function isConsultant(user: { email?: string; email_confirmed_at?: string } | null) {
  return !!user?.email_confirmed_at && user.email?.toLowerCase() === CONSULTANT_EMAIL;
}
export const passwordSchema = z.string().min(12).max(128)
  .regex(/[a-zA-Z]/).regex(/[0-9]/);
export const consultancyCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), requestId: z.string().uuid(), name: z.string().trim().min(2).max(150),
    contactName: z.string().trim().min(2).max(150), email: z.string().trim().toLowerCase().email().max(254),
    phone: z.string().trim().max(30), document: z.string().trim().max(30), city: z.string().trim().max(100),
    state: z.string().regex(/^([A-Z]{2})?$/) }).strict(),
  z.object({ action: z.literal("deliver"), companyId: z.string().uuid(), password: passwordSchema }).strict(),
]);
export function sameOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    return ["http:", "https:"].includes(origin.protocol) && origin.host ===
      (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host);
  } catch { return false; }
}
export type ConsultancyCompany = { company_id: string; name: string; client_email: string;
  contact_name: string; delivered_at: string | null; claimed_at: string | null; consultant_until: string | null };
