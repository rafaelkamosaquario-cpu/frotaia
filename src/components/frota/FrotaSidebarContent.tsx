"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { FROTA_NAV_ITEMS } from "./frotaNavItems";

interface FrotaSidebarContentProps {
  onNavigate?: () => void;
}

export function FrotaSidebarContent({ onNavigate }: FrotaSidebarContentProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3">
        <p className="px-2.5 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Gestão de frota
        </p>
        <ul className="flex flex-col gap-0.5">
          {FROTA_NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                    isActive ? "bg-surface-muted font-medium text-foreground" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
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
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <MessageSquareText className="size-4 shrink-0" aria-hidden />
          Voltar pro chat
        </Link>
      </div>
    </div>
  );
}
