"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { FrotaBrand } from "./FrotaBrand";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { signOut } from "@/services/supabase/authService";
import type { CompanyMemberRole } from "@/lib/supabase/tables";

interface FrotaHeaderProps {
  onOpenSidebar: () => void;
  companyName: string;
  role: CompanyMemberRole;
}

export function FrotaHeader({ onOpenSidebar, companyName, role }: FrotaHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-3 backdrop-blur-md sm:px-4">
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Abrir menu">
          <Menu className="size-5" aria-hidden />
        </Button>
        <FrotaBrand compact className="lg:hidden" />
        <FrotaBrand className="hidden lg:flex" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-foreground">{companyName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
        </div>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sair">
          <LogOut className="size-4.5" aria-hidden />
        </Button>
      </div>
    </header>
  );
}

const ROLE_LABEL: Record<CompanyMemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};
