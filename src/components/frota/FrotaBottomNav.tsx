"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Truck, Zap, Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Navegação principal do painel no mobile (refinamento visual 08/2026) —
 * substitui a sidebar de 16 itens como destino primário no celular. Máximo
 * de 5 destinos (pedido explícito): 4 rotas reais + "Mais", que abre o MESMO
 * drawer que já existia (FrotaMobileSidebar/FrotaSidebarContent, agora
 * agrupado) — nenhuma lista duplicada, nenhuma rota nova, nenhum módulo
 * escondido. Só visível abaixo de `lg` (mesmo corte que a sidebar já usa
 * pra aparecer/desaparecer).
 */

interface FrotaBottomNavProps {
  onOpenMore: () => void;
}

const DESTINOS = [
  { href: "/frota/dashboard", label: "Início", icon: Home },
  { href: "/frota/veiculos", label: "Frota", icon: Truck },
  { href: "/frota/oportunidades", label: "Radar", icon: Zap },
  { href: "/frota/alertas", label: "Alertas", icon: Bell },
];

export function FrotaBottomNav({ onOpenMore }: FrotaBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="frota-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
    >
      <ul className="flex items-stretch justify-between">
        {DESTINOS.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                data-tour-href={item.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMore}
            data-tour-more-button
            className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            <Menu className="size-5" aria-hidden />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}
