export type FrotaNavGroup = "Visão geral" | "Operação" | "Gestão" | "Acompanhamento" | "Administração";

export interface FrotaNavItem {
  href: string;
  label: string;
  /** Caminho do ícone neon (public/icons/sidebar/*.png) — ver scripts/process-sidebar-icons.js pra gerar/trocar. */
  icon: string;
  group: FrotaNavGroup;
  /** Todas as seções já têm escopo real implementado (ver plano de unificação V1+V2) — mantido pra suportar um placeholder futuro, se alguma seção nova entrar antes de ficar pronta. */
  disponivel: boolean;
}

/**
 * Mesmas 18 rotas de sempre (nenhuma mudou) — refinamento visual 08/2026:
 * ícones neon (cards escuros com borda/halo verde) no lugar do ícone lucide
 * antigo. Pra trocar um ícone, gere o novo card no mesmo estilo e rode
 * scripts/process-sidebar-icons.js (ou aponte pra outro arquivo aqui).
 */
export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/dashboard", label: "Dashboard", icon: "/icons/sidebar/dashboard.png", group: "Visão geral", disponivel: true },

  { href: "/frota/veiculos", label: "Veículos", icon: "/icons/sidebar/veiculos.png", group: "Operação", disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", icon: "/icons/sidebar/motoristas.png", group: "Operação", disponivel: true },
  { href: "/frota/fretes", label: "Fretes / Análises", icon: "/icons/sidebar/fretes.png", group: "Operação", disponivel: true },
  { href: "/frota/oportunidades", label: "Oportunidades", icon: "/icons/sidebar/oportunidades.png", group: "Operação", disponivel: true },

  { href: "/frota/manutencao", label: "Manutenção", icon: "/icons/sidebar/manutencao.png", group: "Gestão", disponivel: true },
  { href: "/frota/documentos", label: "Documentos", icon: "/icons/sidebar/documentos.png", group: "Gestão", disponivel: true },
  { href: "/frota/despesas", label: "Despesas", icon: "/icons/sidebar/despesas.png", group: "Gestão", disponivel: true },
  { href: "/frota/jornadas", label: "Jornadas", icon: "/icons/sidebar/jornadas.png", group: "Gestão", disponivel: true },
  { href: "/frota/rotas", label: "Rotas salvas", icon: "/icons/sidebar/rotas.png", group: "Gestão", disponivel: true },
  { href: "/frota/checklists", label: "Checklists", icon: "/icons/sidebar/checklists.png", group: "Gestão", disponivel: true },

  { href: "/frota/agenda", label: "Agenda", icon: "/icons/sidebar/agenda.png", group: "Acompanhamento", disponivel: true },
  { href: "/frota/alertas", label: "Alertas", icon: "/icons/sidebar/alertas.png", group: "Acompanhamento", disponivel: true },
  { href: "/frota/relatorios", label: "Relatórios", icon: "/icons/sidebar/relatorios.png", group: "Acompanhamento", disponivel: true },
  { href: "/frota/documentos-gerados", label: "Documentos gerados", icon: "/icons/sidebar/documentos-gerados.png", group: "Acompanhamento", disponivel: true },
  { href: "/frota/noticias", label: "Notícias", icon: "/icons/sidebar/noticias.png", group: "Acompanhamento", disponivel: true },

  { href: "/frota/empresa", label: "Empresa", icon: "/icons/sidebar/empresa.png", group: "Administração", disponivel: true },
  { href: "/frota/configuracoes", label: "Configurações", icon: "/icons/sidebar/configuracoes.png", group: "Administração", disponivel: true },
];

export const FROTA_NAV_GROUPS: FrotaNavGroup[] = ["Visão geral", "Operação", "Gestão", "Acompanhamento", "Administração"];

/** Os 4 destinos diretos da bottom nav mobile — os demais 12 módulos ficam em "Mais". */
export const FROTA_MOBILE_PRIMARY_HREFS = ["/frota/dashboard", "/frota/veiculos", "/frota/oportunidades", "/frota/alertas"];
