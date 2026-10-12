import { CATALOGO_OFERTAS, formatarReais, type OfertaPlano } from "./catalog";

export function requiresPanelSetup(plan: OfertaPlano) {
  return CATALOGO_OFERTAS[plan].painel;
}

export function panelSetupUrl(plan: OfertaPlano) {
  const offer = CATALOGO_OFERTAS[plan];
  const period = plan.includes("ANUAL") ? "anual" : "mensal";
  const message = `Olá, Rafael! Quero configurar o ${offer.label}, ${period}, para até ${offer.limiteVeiculos} veículos (${formatarReais(offer.precoCentavos)}). Preciso preparar minha empresa, escolher os módulos e combinar pagamento e entrega do painel. Nome da empresa: `;
  return `https://wa.me/5541997295836?text=${encodeURIComponent(message)}`;
}
