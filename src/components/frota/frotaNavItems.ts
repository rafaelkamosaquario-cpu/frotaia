import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FileText,
  Settings,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

export interface FrotaNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só "Veículos" está implementada nesta fase — as demais levam a um placeholder "em breve". */
  disponivel: boolean;
}

export const FROTA_NAV_ITEMS: FrotaNavItem[] = [
  { href: "/frota/veiculos", label: "Veículos", icon: Truck, disponivel: true },
  { href: "/frota/motoristas", label: "Motoristas", icon: Users, disponivel: false },
  { href: "/frota/manutencao", label: "Manutenção", icon: Wrench, disponivel: false },
  { href: "/frota/documentos", label: "Documentos", icon: FileText, disponivel: false },
  { href: "/frota/checklists", label: "Checklists", icon: ClipboardList, disponivel: false },
  { href: "/frota/alertas", label: "Alertas", icon: AlertTriangle, disponivel: false },
  { href: "/frota/relatorios", label: "Relatórios", icon: BarChart3, disponivel: false },
  { href: "/frota/configuracoes", label: "Configurações", icon: Settings, disponivel: false },
];
