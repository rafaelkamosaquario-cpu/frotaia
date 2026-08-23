import {
  LayoutDashboard,
  Building2,
  Truck,
  Users,
  Package,
  Zap,
  Wrench,
  FileText,
  Receipt,
  Clock,
  Map,
  ClipboardCheck,
  Bell,
  BarChart3,
  Newspaper,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type FrotaNavGroup = "Visão geral" | "Operação" | "Gestão" | "Acompanhamento" | "Administração";

export interface FrotaNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: FrotaNavGroup;
  /** Todas as seções já têm escopo real implementado (ver plano de unificação V1+V2) — mantido pra suportar um placeholder futuro, se alguma seção nova entrar antes de ficar pronta. */
  disponivel: boolean;
}

/**
 * Mesmas 16 rotas de sempre (nenhuma mudou) — só reorganizadas visualmente
 * em grupos (refinamento visual 08/2026) e com ícone lucide-react no lugar
 * do emoji antigo, pra padronizar com o resto do painel (Button/Modal/
 * Header já usam lucide em todo canto).
 */
export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Visão geral", disponivel: true },

  { href: "/frota/veiculos", label: "Veículos", icon: Truck, group: "Operação", disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", icon: Users, group: "Operação", disponivel: true },
  { href: "/frota/fretes", label: "Fretes / Análises", icon: Package, group: "Operação", disponivel: true },
  { href: "/frota/oportunidades", label: "Oportunidades", icon: Zap, group: "Operação", disponivel: true },

  { href: "/frota/manutencao", label: "Manutenção", icon: Wrench, group: "Gestão", disponivel: true },
  { href: "/frota/documentos", label: "Documentos", icon: FileText, group: "Gestão", disponivel: true },
  { href: "/frota/despesas", label: "Despesas", icon: Receipt, group: "Gestão", disponivel: true },
  { href: "/frota/jornadas", label: "Jornadas", icon: Clock, group: "Gestão", disponivel: true },
  { href: "/frota/rotas", label: "Rotas salvas", icon: Map, group: "Gestão", disponivel: true },
  { href: "/frota/checklists", label: "Checklists", icon: ClipboardCheck, group: "Gestão", disponivel: true },

  { href: "/frota/alertas", label: "Alertas", icon: Bell, group: "Acompanhamento", disponivel: true },
  { href: "/frota/relatorios", label: "Relatórios", icon: BarChart3, group: "Acompanhamento", disponivel: true },
  { href: "/frota/noticias", label: "Notícias", icon: Newspaper, group: "Acompanhamento", disponivel: true },

  { href: "/frota/empresa", label: "Empresa", icon: Building2, group: "Administração", disponivel: true },
  { href: "/frota/configuracoes", label: "Configurações", icon: Settings, group: "Administração", disponivel: true },
];

export const FROTA_NAV_GROUPS: FrotaNavGroup[] = ["Visão geral", "Operação", "Gestão", "Acompanhamento", "Administração"];

/** Os 4 destinos diretos da bottom nav mobile — os demais 12 módulos ficam em "Mais". */
export const FROTA_MOBILE_PRIMARY_HREFS = ["/frota/dashboard", "/frota/veiculos", "/frota/oportunidades", "/frota/alertas"];
