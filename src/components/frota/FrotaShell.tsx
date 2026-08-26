"use client";

import { useState } from "react";
import { FrotaHeader } from "./FrotaHeader";
import { FrotaSidebar } from "./FrotaSidebar";
import { FrotaMobileSidebar } from "./FrotaMobileSidebar";
import { FrotaBottomNav } from "./FrotaBottomNav";
import { FrotaAiWidget } from "./FrotaAiWidget";
import { PanelTour } from "./PanelTour";
import type { CompanyMemberRole } from "@/lib/supabase/tables";

interface FrotaShellProps {
  companyName: string;
  role: CompanyMemberRole;
  children: React.ReactNode;
}

export function FrotaShell({ companyName, role, children }: FrotaShellProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  return (
    <div className="frota-panel flex h-dvh flex-col bg-background">
      <FrotaHeader companyName={companyName} role={role} />
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
  );
}
