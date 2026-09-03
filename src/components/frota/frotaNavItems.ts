export type FrotaNavGroup = "Visão geral" | "Operação" | "Gestão" | "Acompanhamento" | "Administração";

export interface FrotaNavItem {
  href: string;
  label: string;
  /** Caminho do ícone neon (public/icons/sidebar/*.png) — ver scripts/process-sidebar-icons.mjs pra gerar/trocar. */
  icon: string;
  group: FrotaNavGroup;
  /** Todas as seções já têm escopo real implementado (ver plano de unificação V1+V2) — mantido pra suportar um placeholder futuro, se alguma seção nova entrar antes de ficar pronta. */
  disponivel: boolean;
}

/**
 * Mapa centralizado dos ícones neon da sidebar (public/icons/sidebar/*.png,
 * 128px, fundo externo transparente/interno do card preservado — ver
 * scripts/process-sidebar-icons.mjs). Pra trocar um ícone no futuro: gere o
 * novo card no mesmo estilo, salve em public/icons/sidebar/ e troque só o
 * valor aqui — nenhum outro arquivo precisa mudar.
 */
export const SIDEBAR_ICONS = {
  dashboard: "/icons/sidebar/dashboard.png",
  veiculos: "/icons/sidebar/veiculos.png",
  motoristas: "/icons/sidebar/motoristas.png",
  fretes: "/icons/sidebar/fretes.png",
  oportunidades: "/icons/sidebar/oportunidades.png",
  manutencao: "/icons/sidebar/manutencao.png",
  documentos: "/icons/sidebar/documentos.png",
  despesas: "/icons/sidebar/despesas.png",
  jornadas: "/icons/sidebar/jornadas.png",
  rotas: "/icons/sidebar/rotas.png",
  checklists: "/icons/sidebar/checklists.png",
  agenda: "/icons/sidebar/agenda.png",
  alertas: "/icons/sidebar/alertas.png",
  relatorios: "/icons/sidebar/relatorios.png",
  documentosGerados: "/icons/sidebar/documentos-gerados.png",
  noticias: "/icons/sidebar/noticias.png",
  empresa: "/icons/sidebar/empresa.png",
  configuracoes: "/icons/sidebar/configuracoes.png",
  /** Reaproveita o ícone de "empresa" (prédio) — pacote A2 não tem sobra pra um glifo novo; prédio genérico representa bem um fornecedor/posto externo. */
  fornecedores: "/icons/sidebar/empresa.png",
} as const satisfies Record<string, string>;

/** 19 rotas — Postos e fornecedores adicionada na rodada de evolução funcional 09/2026 (item 1/5). */
export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/dashboard", label: "Dashboard", icon: SIDEBAR_ICONS.dashboard, group: "Visão geral", disponivel: true },

  { href: "/frota/veiculos", label: "Veículos", icon: SIDEBAR_ICONS.veiculos, group: "Operação", disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", icon: SIDEBAR_ICONS.motoristas, group: "Operação", disponivel: true },
  { href: "/frota/fretes", label: "Fretes / Análises", icon: SIDEBAR_ICONS.fretes, group: "Operação", disponivel: true },
  { href: "/frota/oportunidades", label: "Oportunidades", icon: SIDEBAR_ICONS.oportunidades, group: "Operação", disponivel: true },

  { href: "/frota/manutencao", label: "Manutenção", icon: SIDEBAR_ICONS.manutencao, group: "Gestão", disponivel: true },
  { href: "/frota/documentos", label: "Documentos", icon: SIDEBAR_ICONS.documentos, group: "Gestão", disponivel: true },
  { href: "/frota/despesas", label: "Despesas", icon: SIDEBAR_ICONS.despesas, group: "Gestão", disponivel: true },
  { href: "/frota/jornadas", label: "Jornadas", icon: SIDEBAR_ICONS.jornadas, group: "Gestão", disponivel: true },
  { href: "/frota/rotas", label: "Rotas salvas", icon: SIDEBAR_ICONS.rotas, group: "Gestão", disponivel: true },
  { href: "/frota/checklists", label: "Checklists", icon: SIDEBAR_ICONS.checklists, group: "Gestão", disponivel: true },
  { href: "/frota/fornecedores", label: "Postos e fornecedores", icon: SIDEBAR_ICONS.fornecedores, group: "Gestão", disponivel: true },

  { href: "/frota/agenda", label: "Agenda", icon: SIDEBAR_ICONS.agenda, group: "Acompanhamento", disponivel: true },
  { href: "/frota/alertas", label: "Alertas", icon: SIDEBAR_ICONS.alertas, group: "Acompanhamento", disponivel: true },
  { href: "/frota/relatorios", label: "Relatórios", icon: SIDEBAR_ICONS.relatorios, group: "Acompanhamento", disponivel: true },
  { href: "/frota/documentos-gerados", label: "Documentos gerados", icon: SIDEBAR_ICONS.documentosGerados, group: "Acompanhamento", disponivel: true },
  { href: "/frota/noticias", label: "Notícias", icon: SIDEBAR_ICONS.noticias, group: "Acompanhamento", disponivel: true },

  { href: "/frota/empresa", label: "Empresa", icon: SIDEBAR_ICONS.empresa, group: "Administração", disponivel: true },
  { href: "/frota/configuracoes", label: "Configurações", icon: SIDEBAR_ICONS.configuracoes, group: "Administração", disponivel: true },
];

export const FROTA_NAV_GROUPS: FrotaNavGroup[] = ["Visão geral", "Operação", "Gestão", "Acompanhamento", "Administração"];

/** Os 4 destinos diretos da bottom nav mobile — os demais 12 módulos ficam em "Mais". */
export const FROTA_MOBILE_PRIMARY_HREFS = ["/frota/dashboard", "/frota/veiculos", "/frota/oportunidades", "/frota/alertas"];
