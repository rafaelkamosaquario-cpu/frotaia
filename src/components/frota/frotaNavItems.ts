export interface FrotaNavItem {
  href: string;
  label: string;
  emoji: string;
  /** Todas as seções já têm escopo real implementado (ver plano de unificação V1+V2) — mantido pra suportar um placeholder futuro, se alguma seção nova entrar antes de ficar pronta. */
  disponivel: boolean;
}

/** Mesma ordem/seções do protótipo (Projetos-/frotabot/admin) auditado. "Empresas" aqui vira o perfil da própria empresa (V2 é escopado por RLS, não multi-tenant como o protótipo era). */
export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/dashboard", label: "Dashboard", emoji: "📊", disponivel: true },
  { href: "/frota/empresa", label: "Empresa", emoji: "🏢", disponivel: true },
  { href: "/frota/veiculos", label: "Veículos", emoji: "🚚", disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", emoji: "🧑‍✈️", disponivel: true },
  { href: "/frota/fretes", label: "Fretes / Análises", emoji: "📦", disponivel: true },
  { href: "/frota/oportunidades", label: "Oportunidades", emoji: "⚡", disponivel: true },
  { href: "/frota/manutencao", label: "Manutenção", emoji: "🔧", disponivel: true },
  { href: "/frota/documentos", label: "Documentos", emoji: "📄", disponivel: true },
  { href: "/frota/despesas", label: "Despesas", emoji: "🧾", disponivel: true },
  { href: "/frota/jornadas", label: "Jornadas", emoji: "🕐", disponivel: true },
  { href: "/frota/rotas", label: "Rotas salvas", emoji: "🗺️", disponivel: true },
  { href: "/frota/checklists", label: "Checklists", emoji: "✅", disponivel: true },
  { href: "/frota/alertas", label: "Alertas", emoji: "🔔", disponivel: true },
  { href: "/frota/relatorios", label: "Relatórios", emoji: "📈", disponivel: true },
  { href: "/frota/noticias", label: "Notícias", emoji: "📰", disponivel: true },
  { href: "/frota/configuracoes", label: "Configurações", emoji: "⚙️", disponivel: true },
];
