"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import { FrotaBrand } from "./FrotaBrand";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { signOut } from "@/services/supabase/authService";
import { cn } from "@/lib/utils";
import type { CompanyMemberRole } from "@/lib/supabase/tables";

interface FrotaHeaderProps {
  companyName: string;
  role: CompanyMemberRole;
}

const ROLE_LABEL: Record<CompanyMemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};

export function FrotaHeader({ companyName, role }: FrotaHeaderProps) {
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);

  async function handleLogout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-3 backdrop-blur-md sm:px-4">
      <FrotaBrand compact className="lg:hidden" />
      <FrotaBrand className="hidden lg:flex" />

      {/* Desktop/tablet: tudo visível lado a lado — sem aperto de espaço a partir de lg. */}
      <div className="hidden items-center gap-3 lg:flex">
        <div className="text-right">
          <p className="text-sm font-medium text-foreground">{companyName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
          <LogOut className="size-4.5" aria-hidden />
        </Button>
      </div>

      {/* Mobile/tablet: um único botão de conta, resto vira menu (evita disputar espaço com o wordmark). */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setAccountOpen((v) => !v)}
          aria-expanded={accountOpen}
          aria-haspopup="true"
          aria-label="Conta"
          className="flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-sm text-foreground"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {companyName.trim().charAt(0).toUpperCase() || "F"}
          </span>
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", accountOpen && "rotate-180")} aria-hidden />
        </button>

        {accountOpen && (
          <>
            <button
              type="button"
              aria-label="Fechar menu de conta"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setAccountOpen(false)}
            />
            <div className="absolute right-3 top-[calc(100%+0.5rem)] z-50 w-56 rounded-xl border border-border bg-surface p-2 shadow-xl sm:right-4">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium text-foreground">{companyName}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
              </div>
              <div className="my-1 border-t border-border" />
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-sm text-foreground">Tema</span>
                <ThemeToggle />
              </div>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                <LogOut className="size-4" aria-hidden />
                Sair
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
