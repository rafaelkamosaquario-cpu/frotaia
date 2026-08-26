"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FROTA_NAV_ITEMS, FROTA_NAV_GROUPS } from "./frotaNavItems";

interface FrotaSidebarContentProps {
  onNavigate?: () => void;
}

export function FrotaSidebarContent({ onNavigate }: FrotaSidebarContentProps) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto scrollbar-thin p-3">
      {FROTA_NAV_GROUPS.map((group) => {
        const items = FROTA_NAV_ITEMS.filter((item) => item.group === group);
        if (items.length === 0) return null;

        return (
          <div key={group} className="mb-1 last:mb-0">
            <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 first:pt-1">
              {group}
            </p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const isActive = pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      data-tour-href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-sm transition-colors",
                        isActive
                          ? "border-primary bg-surface-muted font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} aria-hidden />
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
