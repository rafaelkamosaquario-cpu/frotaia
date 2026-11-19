"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, UserRoundCog, UserRoundPlus, MessageCircle, CircleGauge } from "lucide-react";

const entries = [
  { href: "/administracao", label: "Dashboard", icon: LayoutDashboard },
  { href: "/empresas", label: "Minhas empresas / trocar empresa", icon: Building2 },
  { href: "/empresas?view=acessos", label: "Gerenciar acessos", icon: UserRoundCog },
  { href: "/consultoria", label: "Cadastrar cliente / configurar painel", icon: UserRoundPlus },
  { href: "/contratacoes-diretas", label: "Contratações Frota IA WhatsApp", icon: MessageCircle },
  { href: "/acompanhamento-pneus", label: "Acompanhamento de clientes e CPK", icon: CircleGauge },
];
export function RodoCoreAdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <section aria-label="Administração RodoCore" className="mb-3 border-b border-border pb-3">
    <p className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">RodoCore · painel mestre</p>
    {entries.map(({href,label,icon:Icon}) => <Link key={href} href={href} onClick={onNavigate} className={`my-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${(pathname===href || (href==="/acompanhamento-pneus" && pathname?.startsWith(href+"/"))) ? "bg-primary/10 font-semibold text-foreground" : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"}`}><Icon className="size-4 shrink-0" aria-hidden/><span>{label}</span></Link>)}
  </section>;
}
