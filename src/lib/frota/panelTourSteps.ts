/**
 * Tour visual do Painel (V2/Gestão), 08/2026 — configuração centralizada
 * dos 8 passos (seção 23 da spec: sem duplicar texto entre componentes).
 * Puro/sem DOM aqui — a resolução do elemento-alvo real (`data-tour-href`/
 * `data-tour`) fica em `PanelTour.tsx`, que é quem sabe rodar no browser.
 */

export const PANEL_TOUR_STEPS = ["dashboard", "indicadores", "ia_sugere", "frota", "operacao", "radar", "ia_widget", "conclusao"] as const;
export type PanelTourStep = (typeof PANEL_TOUR_STEPS)[number];

export type PanelTourTarget =
  | { kind: "nav-href"; href: string }
  | { kind: "data"; key: string }
  | { kind: "none" };

export interface PanelTourStepDef {
  step: PanelTourStep;
  numero: number;
  titulo: string;
  texto: string;
  target: PanelTourTarget;
}

const TOTAL_PASSOS = PANEL_TOUR_STEPS.length;

export const PANEL_TOUR_STEP_DEFS: Record<PanelTourStep, PanelTourStepDef> = {
  dashboard: {
    step: "dashboard",
    numero: 1,
    titulo: "Dashboard",
    texto: "Aqui você vê o que está acontecendo na sua operação.",
    target: { kind: "nav-href", href: "/frota/dashboard" },
  },
  indicadores: {
    step: "indicadores",
    numero: 2,
    titulo: "Indicadores",
    texto: "Os principais indicadores — veículos, motoristas, manutenção, documentos, custos — ficam resumidos aqui.",
    target: { kind: "data", key: "kpis" },
  },
  ia_sugere: {
    step: "ia_sugere",
    numero: 3,
    titulo: "Frota IA sugere",
    texto: "O Frota IA analisa os dados da operação e chama sua atenção pra o que merece prioridade.",
    target: { kind: "data", key: "ia-sugere" },
  },
  frota: {
    step: "frota",
    numero: 4,
    titulo: "Frota",
    texto: "No Gestão, você acompanha até 10 veículos e seus motoristas.",
    target: { kind: "nav-href", href: "/frota/veiculos" },
  },
  operacao: {
    step: "operacao",
    numero: 5,
    titulo: "Operação",
    texto: "Manutenção, documentos, despesas e checklists — registros feitos no painel ou pelo WhatsApp ficam organizados na mesma operação.",
    target: { kind: "nav-href", href: "/frota/manutencao" },
  },
  radar: {
    step: "radar",
    numero: 6,
    titulo: "Radar de Fretes",
    texto: "Crie radares e acompanhe oportunidades compatíveis com sua operação.",
    target: { kind: "nav-href", href: "/frota/oportunidades" },
  },
  ia_widget: {
    step: "ia_widget",
    numero: 7,
    titulo: "Pergunte ao Frota IA",
    texto: 'Não sabe onde encontrar alguma coisa? Pergunte ao Frota IA — ex.: "O que precisa da minha atenção hoje?"',
    target: { kind: "data", key: "ia-widget" },
  },
  conclusao: {
    step: "conclusao",
    numero: 8,
    titulo: "Pronto!",
    texto: "Você já conhece o essencial do Frota IA Gestão. Pode abrir este tour de novo quando quiser, em Configurações.",
    target: { kind: "none" },
  },
};

export function proximoPassoTourV2(step: PanelTourStep): PanelTourStep | null {
  const indice = PANEL_TOUR_STEPS.indexOf(step);
  return indice >= 0 && indice < PANEL_TOUR_STEPS.length - 1 ? PANEL_TOUR_STEPS[indice + 1] : null;
}

export function passoAnteriorTourV2(step: PanelTourStep): PanelTourStep | null {
  const indice = PANEL_TOUR_STEPS.indexOf(step);
  return indice > 0 ? PANEL_TOUR_STEPS[indice - 1] : null;
}

export function progressoTourV2(step: PanelTourStep): string {
  return `${PANEL_TOUR_STEP_DEFS[step].numero} de ${TOTAL_PASSOS}`;
}
