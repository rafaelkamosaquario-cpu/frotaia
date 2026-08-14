"use client";

import { useState } from "react";
import { FrotaHeader } from "./FrotaHeader";
import { FrotaSidebar } from "./FrotaSidebar";
import { FrotaMobileSidebar } from "./FrotaMobileSidebar";
import { FrotaAiWidget } from "./FrotaAiWidget";
import type { CompanyMemberRole } from "@/lib/supabase/tables";

interface FrotaShellProps {
  companyName: string;
  role: CompanyMemberRole;
  children: React.ReactNode;
}

export function FrotaShell({ companyName, role, children }: FrotaShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <FrotaHeader onOpenSidebar={() => setIsSidebarOpen(true)} companyName={companyName} role={role} />
      <div className="flex min-h-0 flex-1">
        <FrotaSidebar />
        <FrotaMobileSidebar open={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">{children}</main>
      </div>
      <FrotaAiWidget />
    </div>
  );
}
