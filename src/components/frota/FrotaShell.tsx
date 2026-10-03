"use client";

import { useState } from "react";
import { FrotaHeader } from "./FrotaHeader";
import { FrotaSidebar } from "./FrotaSidebar";
import { FrotaMobileSidebar } from "./FrotaMobileSidebar";
import { FrotaBottomNav } from "./FrotaBottomNav";
import { FrotaAiWidget } from "./FrotaAiWidget";
import { PanelTour } from "./PanelTour";
import { CompanyScopeBoundary } from "./CompanyScopeBoundary";
import type { CompanyMemberRole } from "@/lib/supabase/tables";

interface FrotaShellProps {
  companyId: string;
  companyName: string;
  role: CompanyMemberRole;
  children: React.ReactNode;
}

export function FrotaShell({ companyId, companyName, role, children }: FrotaShellProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <CompanyScopeBoundary companyId={companyId}>
    <div className="frota-panel frota-refined flex h-dvh flex-col bg-background">
      <FrotaHeader companyName={companyName} role={role} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 text-sm">
        <span>Empresa em atendimento: <strong>{companyName}</strong></span>
        <a href="/empresas" className="font-medium text-primary underline">Trocar empresa / gerenciar acessos</a>
      </div>
      <div className="flex min-h-0 flex-1">
        <FrotaSidebar />
        <FrotaMobileSidebar open={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          {children}
        </main>
      </div>
      <FrotaBottomNav onOpenMore={() => setIsMoreOpen(true)} />
      <FrotaAiWidget />
      <PanelTour />
    </div>
    </CompanyScopeBoundary>
  );
}
