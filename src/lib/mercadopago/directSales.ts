import { z } from "zod";
import { CATALOGO_OFERTAS, formatarReais } from "./catalog";
import { requiresPanelSetup, panelSetupUrl } from "./panelSetup";

export const DIRECT_PLANS = ["INDIVIDUAL_MENSAL", "INDIVIDUAL_ANUAL_PIX", "ESSENCIAL_MENSAL", "ESSENCIAL_ANUAL_PIX", "PRO_MENSAL", "PRO_ANUAL_PIX"] as const;
export type DirectPlan = typeof DIRECT_PLANS[number];
export function normalizeDirectPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55[1-9]\d{9,10}$/.test(digits) ? `+${digits}` : null;
}
export const directPaymentCommand = z.object({
  requestId: z.string().uuid(), companyId: z.string().uuid(), phone: z.string().transform(normalizeDirectPhone).refine(v => v !== null),
  plan: z.enum(DIRECT_PLANS), reference: z.string().trim().regex(/^\d{6,30}$/),
  amountCents: z.number().int().positive(), paidAt: z.string().datetime({ offset: true }),
  confirmed: z.literal(true),
}).strict().superRefine((v, ctx) => {
  if (CATALOGO_OFERTAS[v.plan].precoCentavos !== v.amountCents) ctx.addIssue({ code: "custom", message: "Valor diferente do catálogo." });
  if (new Date(v.paidAt).getTime() > Date.now()) ctx.addIssue({ code: "custom", message: "Pagamento no futuro." });
});
export function directSalesUrl(plan: DirectPlan) {
  if (requiresPanelSetup(plan)) return panelSetupUrl(plan);
  const offer = CATALOGO_OFERTAS[plan];
  const period = plan.includes("ANUAL") ? "anual" : "mensal";
  return `https://wa.me/5541997295836?text=${encodeURIComponent(`Olá, Rafael! Vim pela página do Frota IA. Quero contratar ${offer.label}, ${period}, ${offer.limiteVeiculos} veículo(s), por ${formatarReais(offer.precoCentavos)}. Quero pagar por Pix com seu atendimento. Meu WhatsApp de uso no Frota IA é: `)}`;
}
