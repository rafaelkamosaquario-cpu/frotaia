export const APP_ADDON_CENTS = 990;
export const APP_ADDON_REFERENCE = "APP_INDIVIDUAL_1M";
export const APP_ADDON_PATH = "/adicional-aplicativo";
export const APP_ONLY_TOOLS = new Set(["gerenciar_alerta", "gerenciar_google_calendar", "gerenciar_noticias_setor", "gerar_documento"]);
export type AddonState = { allowed: boolean; baseActive: boolean; preserved: boolean; until: string | null };
export function addonAllowed(baseActive: boolean, preserved: boolean, until: string | null, now = Date.now()) {
  return baseActive && (preserved || (!!until && Date.parse(until) > now));
}
export function parseAddonReference(value: string | null): string | null {
  const parts = value?.split("|");
  return parts?.length === 2 && parts[1] === APP_ADDON_REFERENCE && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[0]) ? parts[0] : null;
}
export function addonToolAllowed(tool: string, state: AddonState, whatsapp: boolean) {
  // This legacy tool subscribes to WhatsApp broadcasts, not app news.
  if(tool === "gerenciar_noticias_setor" && !state.preserved) return false;
  return !APP_ONLY_TOOLS.has(tool) || (state.allowed && (!whatsapp || state.preserved));
}
export function addonPaymentValid(amount: number, currency?: string | null) {
  return Number.isInteger(amount) && amount === APP_ADDON_CENTS && currency === "BRL";
}
export function addonSalesUrl() {
  return "https://wa.me/5541997295836?text=" + encodeURIComponent("Olá, Rafael! Quero contratar o adicional do aplicativo Frota IA por R$ 9,90 para um mês, sem renovação automática. Já preciso ter o plano WhatsApp ativo. Quero pagar por Pix manual. Meu número de uso é: ");
}
