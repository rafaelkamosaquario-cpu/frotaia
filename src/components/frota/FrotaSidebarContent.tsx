"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { FrotaNavIcon } from "./FrotaNavIcon";
import { cn } from "@/lib/utils";
import { FROTA_NAV_ITEMS, FROTA_NAV_GROUPS } from "./frotaNavItems";
import { useFrotaNavigation } from "./FrotaNavigationContext";
import { TIMBER_PRIMARY, TIMBER_SUPPORT } from "@/lib/frota/navigationProfile";

interface FrotaSidebarContentProps {
  onNavigate?: () => void;
}

export function FrotaSidebarContent({ onNavigate }: FrotaSidebarContentProps) {
  const pathname = usePathname();
  const { compact, canExpand, expanded, toggle } = useFrotaNavigation();
  const renderCompactLink = (item: { href: string; label: string }) => <Link key={item.href} href={item.href} onClick={onNavigate} data-tour-href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors", pathname === item.href ? "border-primary/30 bg-primary/10 font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-primary/5 hover:text-foreground")}><FrotaNavIcon href={item.href} /><span>{item.label}</span></Link>;

  if (compact) return <nav aria-label="Menu da operação" className="frota-menu flex-1 space-y-2 overflow-y-auto p-3">
    <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Transporte e carregamento</p>
    {TIMBER_PRIMARY.map(renderCompactLink)}
    <details className="rounded-lg border border-border p-2" open={TIMBER_SUPPORT.includes(pathname ?? "") || undefined}>
      <summary className="cursor-pointer px-1 py-2 text-sm font-medium">Cadastros e lançamentos</summary>
      {FROTA_NAV_ITEMS.filter(item => TIMBER_SUPPORT.includes(item.href)).map(renderCompactLink)}
    </details>
    {canExpand && <button type="button" onClick={toggle} className="w-full rounded-lg border border-border p-2 text-left text-xs text-muted-foreground">Consultoria: abrir menu completo</button>}
  </nav>;

  return (
    <nav className="frota-menu flex-1 overflow-y-auto scrollbar-thin p-3">
      {canExpand && expanded && <button type="button" onClick={toggle} className="mb-3 w-full rounded-lg border border-border p-2 text-left text-xs">Voltar ao menu do cliente</button>}
      {FROTA_NAV_GROUPS.map((group) => {
        const items = FROTA_NAV_ITEMS.filter((item) => item.group === group);
        if (items.length === 0) return null;

        return (
          <div key={group} className="mb-1.5 last:mb-0">
            <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 first:pt-1">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      data-tour-href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg border px-2 py-1 text-sm transition-colors duration-150",
                        isActive
                          ? "border-primary/30 bg-primary/[0.08] font-medium text-foreground shadow-[0_0_16px_-8px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
                          : "border-transparent text-muted-foreground hover:border-primary/20 hover:bg-primary/[0.05] hover:text-foreground"
                      )}
                    >
                      <FrotaNavIcon href={item.href} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {!item.disponivel && (
                        <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          em breve
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
