"use client";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { FrotaHeader } from "./FrotaHeader";
import { FrotaSidebarContent } from "./FrotaSidebarContent";
import { FrotaNavigationProvider } from "./FrotaNavigationContext";

/** Used only after the server has checked the existing consultant permission. */
export function RodoCoreAdminShell({children}:{children:React.ReactNode}) {
  const [open,setOpen]=useState(false);
  return <FrotaNavigationProvider companyId="" canExpand enabledModules={null}><div className="frota-panel frota-refined flex h-dvh flex-col bg-background text-foreground">
    <FrotaHeader companyName="Painel mestre" role="owner" master/>
    <button className="flex items-center gap-2 border-b border-border p-3 lg:hidden" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?<X className="size-5"/>:<Menu className="size-5"/>}Menu RodoCore</button>
    <div className="flex min-h-0 flex-1"><aside className={`${open?"block":"hidden"} w-72 shrink-0 overflow-y-auto border-r border-border bg-surface p-3 lg:block`}><FrotaSidebarContent onNavigate={()=>setOpen(false)}/></aside><div className={`min-w-0 flex-1 overflow-y-auto ${open?"hidden lg:block":""}`}>{children}</div></div>
  </div></FrotaNavigationProvider>;
}
