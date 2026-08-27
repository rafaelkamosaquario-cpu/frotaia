"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg border px-2 py-1 text-sm transition-colors duration-150",
                        isActive
                          ? "border-primary/30 bg-primary/[0.08] font-medium text-foreground shadow-[0_0_16px_-8px_color-mix(in_srgb,var(--primary)_55%,transparent)]"
                          : "border-transparent text-muted-foreground hover:border-primary/20 hover:bg-primary/[0.05] hover:text-foreground"
                      )}
                    >
                      <Image
                        src={item.icon}
                        alt=""
                        width={32}
                        height={32}
                        className={cn(
                          "size-6 shrink-0 object-contain transition-opacity duration-150 lg:size-7",
                          isActive ? "opacity-100" : "opacity-80 group-hover:opacity-95"
                        )}
                        aria-hidden
                      />
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
