import { Bell, Building2, CalendarDays, ChartNoAxesCombined, CircleDot, ClipboardCheck, Clock3, FileStack, FileText, Fuel, Gauge, MapPinned, Newspaper, Radar, Receipt, Route, Settings, TrendingUp, Truck, Users, Wallet, Wrench } from "lucide-react";

const icons = {
  dashboard: Gauge, veiculos: Truck, motoristas: Users, fretes: Route,
  oportunidades: Radar, manutencao: Wrench, documentos: FileText, despesas: Wallet,
  jornadas: Clock3, rotas: MapPinned, checklists: ClipboardCheck, fornecedores: Building2,
  abastecimentos: Fuel, pneus: CircleDot, receitas: TrendingUp, agenda: CalendarDays,
  alertas: Bell, relatorios: ChartNoAxesCombined, "documentos-gerados": FileStack,
  noticias: Newspaper, empresa: Building2, configuracoes: Settings,
};
export function FrotaNavIcon({ href }: { href: string }) {
  const key = href.split("/").pop() as keyof typeof icons;
  const Icon = icons[key] ?? Receipt;
  return <Icon className="size-5 shrink-0" strokeWidth={1.65} aria-hidden />;
}
