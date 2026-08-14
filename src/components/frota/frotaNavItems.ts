import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
  Wrench,
  WalletCards,
} from "lucide-react";

export interface FrotaNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só "Veículos" está implementada nesta fase — as demais levam a um placeholder "em breve". */
  disponivel: boolean;
}

/** Mesma ordem/seções do protótipo (Projetos-/frotabot/admin) auditado. "Empresas" aqui vira o perfil da própria empresa (V2 é escopado por RLS, não multi-tenant como o protótipo era). */
export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/dashboard", label: "Dashboard", icon: LayoutDashboard, disponivel: true },
  { href: "/frota/empresa", label: "Empresa", icon: Building2, disponivel: true },
  { href: "/frota/veiculos", label: "Veículos", icon: Truck, disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", icon: Users, disponivel: true },
  { href: "/frota/manutencao", label: "Manutenção", icon: Wrench, disponivel: true },
  { href: "/frota/documentos", label: "Documentos", icon: FileText, disponivel: true },
  { href: "/frota/despesas", label: "Despesas", icon: WalletCards, disponivel: true },
  { href: "/frota/checklists", label: "Checklists", icon: ClipboardList, disponivel: true },
  { href: "/frota/alertas", label: "Alertas", icon: AlertTriangle, disponivel: true },
  { href: "/frota/relatorios", label: "Relatórios", icon: BarChart3, disponivel: true },
  { href: "/frota/configuracoes", label: "Configurações", icon: Settings, disponivel: false },
];
